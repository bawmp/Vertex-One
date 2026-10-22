"use server";

import { z } from "zod";
import { desc, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { document, documentRedige } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { televerserDocument } from "@/lib/documents/stockage";
import { contenuVide, LIMITES, validerContenu } from "@/lib/redaction/contenu";
import { miseEnPageParDefaut, validerMiseEnPage } from "@/lib/redaction/mise-en-page";
import { documentRedigeAutorise, genererFichier, moduleDocumentsDisponible, type FormatExport } from "@/lib/redaction/service";
import { eq } from "drizzle-orm";

const CHEMIN = "/app/documents/rediger";

export type EtatRedaction = { erreur?: string } | null;

const schemaTitre = z.string().trim().min(1, "Donnez un titre au document.").max(LIMITES.titreMax, `Titre trop long (${LIMITES.titreMax} caractères maximum).`);

export async function creerDocumentRedige(_etat: EtatRedaction, formData: FormData): Promise<EtatRedaction> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "DOCUMENTS", "CREER")) return { erreur: "Vous n'avez pas le droit de créer un document." };
  const titre = schemaTitre.safeParse(formData.get("titre"));
  if (!titre.success) return { erreur: titre.error.issues[0]?.message ?? "Titre invalide." };

  const id = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await moduleDocumentsDisponible(tx, utilisateurConnecte.entrepriseId))) return null;
    const [cree] = await tx
      .insert(documentRedige)
      .values({ entrepriseId: utilisateurConnecte.entrepriseId, titre: titre.data, contenu: contenuVide(), miseEnPage: miseEnPageParDefaut(), assigneAId: utilisateurConnecte.utilisateurId })
      .returning({ id: documentRedige.id });
    return cree.id;
  });
  if (!id) return { erreur: "Cette fonctionnalité n'est pas disponible avec votre abonnement." };
  redirect(`${CHEMIN}/${id}`);
}

export type ResultatEnregistrement = { erreur: string } | { ok: true; modifieLe: string };

/**
 * Enregistre le titre, le contenu et la mise en page. TOUT est revalidé ici (le navigateur n'est jamais cru) : contenu en
 * liste blanche, mise en page aux valeurs connues, titre borné ; l'entreprise et le propriétaire ne changent jamais.
 */
export async function enregistrerDocumentRedige(id: string, charge: { titre: unknown; contenu: unknown; miseEnPage: unknown }): Promise<ResultatEnregistrement> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const titre = schemaTitre.safeParse(charge.titre);
  if (!titre.success) return { erreur: titre.error.issues[0]?.message ?? "Titre invalide." };
  const contenu = validerContenu(charge.contenu);
  if ("erreur" in contenu) return { erreur: contenu.erreur };
  const miseEnPage = validerMiseEnPage(charge.miseEnPage);

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await documentRedigeAutorise(tx, utilisateurConnecte, id, "MODIFIER"))) return null;
    const maintenant = new Date();
    await tx.update(documentRedige).set({ titre: titre.data, contenu: contenu.contenu, miseEnPage, modifieLe: maintenant }).where(eq(documentRedige.id, id));
    return maintenant;
  });
  if (!resultat) return { erreur: "Document introuvable ou modification non autorisée." };
  revalidatePath(CHEMIN);
  return { ok: true, modifieLe: resultat.toISOString() };
}

export async function supprimerDocumentRedige(id: string): Promise<EtatRedaction> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const ok = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await documentRedigeAutorise(tx, utilisateurConnecte, id, "SUPPRIMER"))) return false;
    await tx.delete(documentRedige).where(eq(documentRedige.id, id));
    return true;
  });
  if (!ok) return { erreur: "Suppression non autorisée." };
  revalidatePath(CHEMIN);
  return null;
}

/**
 * Enregistre le document dans Documents (fichier PDF ou Word, stocké dans R2 comme un téléversement) : il y est alors listé,
 * téléchargeable et partageable comme n'importe quel autre document. Document autonome (ni dossier ni projet), donc jamais sensible.
 */
export async function enregistrerDansDocuments(id: string, format: FormatExport): Promise<EtatRedaction & { nom?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (format !== "pdf" && format !== "docx") return { erreur: "Format inconnu." };
  if (!peut(utilisateurConnecte, "DOCUMENTS", "CREER")) return { erreur: "Vous n'avez pas le droit d'ajouter un document." };

  const fichier = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const d = await documentRedigeAutorise(tx, utilisateurConnecte, id, "VOIR");
    return d ? genererFichier(tx, utilisateurConnecte.entrepriseId, d, format) : null;
  });
  if (!fichier) return { erreur: "Document introuvable." };

  const { televerse, cleStockage, erreur } = await televerserDocument({ entrepriseId: utilisateurConnecte.entrepriseId, nomFichier: fichier.nom, typeMime: fichier.typeMime, contenu: fichier.contenu });
  if (!televerse) return { erreur: erreur ?? "Échec de l'enregistrement du fichier." };

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(document).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      categorie: "GENERAL",
      nom: fichier.nom,
      cleStockage,
      typeMime: fichier.typeMime,
      tailleOctets: fichier.contenu.length,
      televerseParId: utilisateurConnecte.utilisateurId,
    })
  );
  revalidatePath("/app/documents");
  return { nom: fichier.nom };
}

/** Liste des documents rédigés visibles par l'utilisateur (portée du module DOCUMENTS). */
export async function listerDocumentsRediges() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!peut(utilisateurConnecte, "DOCUMENTS", "VOIR") || !(await moduleDocumentsDisponible(tx, utilisateurConnecte.entrepriseId))) return null;
    const visibles = await idsVisibles(tx, utilisateurConnecte, "DOCUMENTS");
    const lignes = await tx
      .select({ id: documentRedige.id, titre: documentRedige.titre, modifieLe: documentRedige.modifieLe, assigneAId: documentRedige.assigneAId })
      .from(documentRedige)
      .where(visibles === "TOUT" ? undefined : inArray(documentRedige.assigneAId, visibles))
      .orderBy(desc(documentRedige.modifieLe));
    return lignes;
  });
}
