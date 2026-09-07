"use server";

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { factureRecurrente, ligneFactureRecurrente, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { resoudreClientVente } from "@/lib/facturation/client-document";

const CHEMIN = "/app/facturation";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatFactureRecurrente = { erreur?: string } | null;

/**
 * Extensions Ventes, Factures récurrentes (échange du 2026-09-07) — un
 * modèle qui ne génère lui-même aucune écriture ni facture à la création :
 * le worker quotidien (src/lib/facturation/recurrence.ts) s'en charge à
 * chaque échéance atteinte. Même vérification NIU que creerDevis()/
 * creerBonCommandeVente() : ce modèle mène directement à de vraies Factures,
 * jamais sans NIU renseigné — même si la première génération peut être
 * différée (dateDebut future), la cohérence d'un seul point de contrôle
 * évite un modèle créé "en attente d'un NIU qui n'arrivera peut-être jamais".
 */
export async function creerFactureRecurrente(_etat: EtatFactureRecurrente, formData: FormData): Promise<EtatFactureRecurrente> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une facture récurrente." };
  }

  const dealId = String(formData.get("dealId") ?? "") || undefined;
  const contactId = String(formData.get("contactId") ?? "") || undefined;
  const libelle = String(formData.get("libelle") ?? "").trim();
  const frequence = String(formData.get("frequence") ?? "");
  const dateDebut = String(formData.get("dateDebut") ?? "");
  const dateFin = String(formData.get("dateFin") ?? "").trim();
  if ((!dealId && !contactId) || !libelle) return { erreur: "Formulaire invalide." };
  if (!["MENSUEL", "TRIMESTRIEL", "ANNUEL"].includes(frequence)) return { erreur: "Fréquence invalide." };
  if (!dateDebut) return { erreur: "La date de première génération est requise." };

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    produitId: formData.getAll("produitId")[i] || undefined,
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));
  const analyseLignes = z.array(schemaLigne).min(1, "Au moins une ligne est requise.").safeParse(lignesBrutes);
  if (!analyseLignes.success) {
    return { erreur: analyseLignes.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauProfil] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const client = await resoudreClientVente(tx, utilisateurConnecte, { dealId, contactId });
    if (!client) throw new Error("CLIENT_INTROUVABLE");

    const [profil] = await tx
      .insert(factureRecurrente)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        dealId: client.dealId,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
        libelle,
        frequence: frequence as "MENSUEL" | "TRIMESTRIEL" | "ANNUEL",
        dateDebut: new Date(dateDebut),
        dateFin: dateFin ? new Date(dateFin) : undefined,
        prochaineDateGeneration: new Date(dateDebut),
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: factureRecurrente.id });

    await tx.insert(ligneFactureRecurrente).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureRecurrenteId: profil.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [profil];
  }).catch((erreur) => {
    if (erreur instanceof Error && (erreur.message === "NIU_MANQUANT" || erreur.message === "CLIENT_INTROUVABLE")) return [];
    throw erreur;
  });

  if (!nouveauProfil) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales), ou le client indiqué est introuvable." };
  }

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

export async function mettreEnPauseFactureRecurrente(factureRecurrenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(factureRecurrente)
      .set({ statut: "EN_PAUSE" })
      .where(and(eq(factureRecurrente.id, factureRecurrenteId), eq(factureRecurrente.statut, "ACTIF")))
  );

  revalidatePath(CHEMIN);
}

/**
 * Un modèle réactivé reprend à sa prochaineDateGeneration telle quelle
 * (jamais recalculée à partir d'aujourd'hui) : si elle est déjà passée, le
 * prochain passage quotidien du worker génère immédiatement la facture due
 * puis avance la date normalement. Simplification connue, comme le paiement
 * partiel ailleurs dans ce module : les échéances manquées pendant la pause
 * ne sont jamais rattrapées en une fois, une seule facture est générée par
 * passage quotidien du worker (voir genererFacturesRecurrentesDues()).
 */
export async function reactiverFactureRecurrente(factureRecurrenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(factureRecurrente)
      .set({ statut: "ACTIF" })
      .where(and(eq(factureRecurrente.id, factureRecurrenteId), eq(factureRecurrente.statut, "EN_PAUSE")))
  );

  revalidatePath(CHEMIN);
}

export async function arreterFactureRecurrente(factureRecurrenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(factureRecurrente)
      .set({ statut: "TERMINE" })
      .where(and(eq(factureRecurrente.id, factureRecurrenteId), inArray(factureRecurrente.statut, ["ACTIF", "EN_PAUSE"])))
  );

  revalidatePath(CHEMIN);
}
