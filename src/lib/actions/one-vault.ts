"use server";

import { z } from "zod";
import { eq, or, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { secretVault, journalAccesSecretVault } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { vaultConfigure, chiffrerContenuSecret, dechiffrerContenuSecret } from "@/lib/vault/crypto";

export type EtatOneVault = { erreur?: string; succes?: boolean } | null;

async function garde(action: "CREER" | "MODIFIER" | "SUPPRIMER") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ONE_VAULT", action)) {
    return { utilisateurConnecte: null, erreur: "Vous n'avez pas les droits nécessaires." } as const;
  }
  return { utilisateurConnecte, erreur: null } as const;
}

/**
 * Un secret privé (non partagé) n'est visible que par son créateur et
 * l'Administrateur — même règle que les documents PIECE_IDENTITE/
 * DONNEES_SANTE (CLAUDE.md). Filtre applicatif, jamais une policy RLS : ce
 * dépôt n'encode aucune notion par-utilisateur en RLS, seulement par-
 * entreprise (voir le commentaire sur `secretVault`, src/db/schema.ts).
 * Factorisé ici pour ne jamais dupliquer la règle entre la liste et
 * revelerSecret().
 */
function filtreVisibilite(utilisateurConnecte: UtilisateurConnecte) {
  if (utilisateurConnecte.role === "ADMIN") return undefined;
  return or(eq(secretVault.partage, true), eq(secretVault.creeParId, utilisateurConnecte.utilisateurId));
}

async function secretVisiblePour(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, secretId: string): Promise<boolean> {
  const [ligne] = await tx.select({ partage: secretVault.partage, creeParId: secretVault.creeParId }).from(secretVault).where(eq(secretVault.id, secretId));
  if (!ligne) return false;
  if (utilisateurConnecte.role === "ADMIN") return true;
  return ligne.partage || ligne.creeParId === utilisateurConnecte.utilisateurId;
}

export async function recupererSecrets() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ONE_VAULT", "VOIR")) return [];

  const filtre = filtreVisibilite(utilisateurConnecte);
  return avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .select({
        id: secretVault.id,
        titre: secretVault.titre,
        identifiant: secretVault.identifiant,
        url: secretVault.url,
        partage: secretVault.partage,
        creeParId: secretVault.creeParId,
        misAJourLe: secretVault.misAJourLe,
      })
      .from(secretVault)
      .where(filtre)
      .orderBy(desc(secretVault.misAJourLe))
  );
}

const schemaSecret = z.object({
  titre: z.string().trim().min(1, "Le titre est requis."),
  identifiant: z.string().trim().optional(),
  motDePasse: z.string().optional(),
  notes: z.string().optional(),
  url: z.string().trim().optional(),
  partage: z.coerce.boolean(),
});

export async function creerSecret(_etat: EtatOneVault, formData: FormData): Promise<EtatOneVault> {
  const { utilisateurConnecte, erreur } = await garde("CREER");
  if (erreur) return { erreur };

  if (!vaultConfigure()) {
    return { erreur: "Le chiffrement de One Vault n'est pas configuré côté serveur — contactez votre administrateur système." };
  }

  const analyse = schemaSecret.safeParse({
    titre: formData.get("titre"),
    identifiant: formData.get("identifiant") || undefined,
    motDePasse: formData.get("motDePasse") || "",
    notes: formData.get("notes") || "",
    url: formData.get("url") || undefined,
    partage: formData.get("partage") === "on",
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0]?.message ?? "Secret invalide." };
  const { titre, identifiant, motDePasse, notes, url, partage } = analyse.data;

  const contenuChiffre = chiffrerContenuSecret({ motDePasse: motDePasse ?? "", notes: notes ?? "" });

  await avecEntreprise(utilisateurConnecte!.entrepriseId, (tx) =>
    tx.insert(secretVault).values({
      entrepriseId: utilisateurConnecte!.entrepriseId,
      titre,
      identifiant,
      url,
      contenuChiffre,
      partage,
      creeParId: utilisateurConnecte!.utilisateurId,
    })
  );

  revalidatePath("/app/one-vault");
  return { succes: true };
}

const schemaModification = schemaSecret.extend({
  secretId: z.string(),
  // Absent (case non révélée côté client) : le mot de passe/notes existants
  // restent inchangés — voir formulaire-secret.tsx. Présent : re-chiffre
  // avec les nouvelles valeurs.
  champsSensiblesModifies: z.coerce.boolean(),
});

export async function modifierSecret(_etat: EtatOneVault, formData: FormData): Promise<EtatOneVault> {
  const { utilisateurConnecte, erreur } = await garde("MODIFIER");
  if (erreur) return { erreur };

  const analyse = schemaModification.safeParse({
    secretId: formData.get("secretId"),
    titre: formData.get("titre"),
    identifiant: formData.get("identifiant") || undefined,
    motDePasse: formData.get("motDePasse") || "",
    notes: formData.get("notes") || "",
    url: formData.get("url") || undefined,
    partage: formData.get("partage") === "on",
    champsSensiblesModifies: formData.get("champsSensiblesModifies") === "on",
  });
  if (!analyse.success) return { erreur: analyse.error.issues[0]?.message ?? "Secret invalide." };
  const { secretId, titre, identifiant, motDePasse, notes, url, partage, champsSensiblesModifies } = analyse.data;

  if (champsSensiblesModifies && !vaultConfigure()) {
    return { erreur: "Le chiffrement de One Vault n'est pas configuré côté serveur — contactez votre administrateur système." };
  }

  await avecEntreprise(utilisateurConnecte!.entrepriseId, async (tx) => {
    const visible = await secretVisiblePour(tx, utilisateurConnecte!, secretId);
    if (!visible) return;

    await tx
      .update(secretVault)
      .set({
        titre,
        identifiant,
        url,
        partage,
        misAJourLe: new Date(),
        ...(champsSensiblesModifies ? { contenuChiffre: chiffrerContenuSecret({ motDePasse: motDePasse ?? "", notes: notes ?? "" }) } : {}),
      })
      .where(eq(secretVault.id, secretId));

    if (champsSensiblesModifies) {
      await tx.insert(journalAccesSecretVault).values({ entrepriseId: utilisateurConnecte!.entrepriseId, secretId, utilisateurId: utilisateurConnecte!.utilisateurId, action: "modification" });
    }
  });

  revalidatePath("/app/one-vault");
  revalidatePath(`/app/one-vault/${secretId}`);
  return null;
}

export async function supprimerSecret(secretId: string): Promise<void> {
  const { utilisateurConnecte, erreur } = await garde("SUPPRIMER");
  if (erreur || !utilisateurConnecte) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visible = await secretVisiblePour(tx, utilisateurConnecte, secretId);
    if (!visible) return;

    await tx.insert(journalAccesSecretVault).values({ entrepriseId: utilisateurConnecte.entrepriseId, secretId, utilisateurId: utilisateurConnecte.utilisateurId, action: "suppression" });
    await tx.delete(secretVault).where(eq(secretVault.id, secretId));
  });

  revalidatePath("/app/one-vault");
  redirect("/app/one-vault");
}

/**
 * Seul point de déchiffrement de ce module — la liste (recupererSecrets)
 * ne renvoie jamais contenuChiffre déchiffré. Journalise systématiquement
 * une ligne "consultation" avant de renvoyer le résultat, y compris quand
 * l'appel vient du formulaire de modification (révéler pour éditer).
 */
export type ResultatRevelation = { ok: true; motDePasse: string; notes: string } | { ok: false; erreur: string };

export async function revelerSecret(secretId: string): Promise<ResultatRevelation> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ONE_VAULT", "VOIR")) return { ok: false, erreur: "Vous n'avez pas les droits nécessaires." };

  if (!vaultConfigure()) return { ok: false, erreur: "Le chiffrement de One Vault n'est pas configuré côté serveur." };

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [ligne] = await tx.select({ contenuChiffre: secretVault.contenuChiffre, partage: secretVault.partage, creeParId: secretVault.creeParId }).from(secretVault).where(eq(secretVault.id, secretId));
    if (!ligne) return { ok: false, erreur: "Ce secret n'existe pas." };
    if (utilisateurConnecte.role !== "ADMIN" && !ligne.partage && ligne.creeParId !== utilisateurConnecte.utilisateurId) {
      return { ok: false, erreur: "Vous n'avez pas accès à ce secret." };
    }

    await tx.insert(journalAccesSecretVault).values({ entrepriseId: utilisateurConnecte.entrepriseId, secretId, utilisateurId: utilisateurConnecte.utilisateurId, action: "consultation" });

    const { motDePasse, notes } = dechiffrerContenuSecret(ligne.contenuChiffre);
    return { ok: true, motDePasse, notes };
  });
}

export async function recupererSecretPourEdition(secretId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ONE_VAULT", "MODIFIER")) return null;

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [secret] = await tx.select().from(secretVault).where(eq(secretVault.id, secretId));
    if (!secret) return null;
    if (utilisateurConnecte.role !== "ADMIN" && !secret.partage && secret.creeParId !== utilisateurConnecte.utilisateurId) return null;
    return secret;
  });
}
