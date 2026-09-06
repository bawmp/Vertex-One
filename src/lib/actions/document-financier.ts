"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { documentFinancier, classeurDocumentFinancier } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { televerserDocument as televerserVersR2, effacerObjetStockage } from "@/lib/documents/stockage";

const CHEMIN = "/app/comptabilite/documents";

export type EtatDocumentFinancier = { erreur?: string } | null;

/**
 * Dépose un fichier dans la Boîte de réception (classeurId NULL) — même
 * mécanique qu'ajouterDocument() (Palier 3), sans rattachement obligatoire à
 * une Facture/un Paiement (Zoho autorise un reçu "en attente" avant tout
 * rapprochement).
 */
export async function televerserDocumentFinancier(_etat: EtatDocumentFinancier, formData: FormData): Promise<EtatDocumentFinancier> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "CREER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter un document." };
  }

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Sélectionnez un fichier." };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserVersR2({
    entrepriseId: utilisateurConnecte.entrepriseId,
    nomFichier: fichier.name,
    typeMime: fichier.type || "application/octet-stream",
    contenu,
  });
  if (!televerse) {
    return { erreur: erreur ?? "Échec du téléversement." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(documentFinancier).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom: fichier.name,
      cleStockage,
      typeMime: fichier.type || "application/octet-stream",
      tailleOctets: fichier.size,
      televerseParId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath(CHEMIN);
  return null;
}

const schemaClasseur = z.object({ nom: z.string().trim().min(1, "Le nom du classeur est obligatoire.") });

export async function creerClasseurDocumentFinancier(_etat: EtatDocumentFinancier, formData: FormData): Promise<EtatDocumentFinancier> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un classeur." };
  }

  const analyse = schemaClasseur.safeParse({ nom: formData.get("nom") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(classeurDocumentFinancier).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nom: analyse.data.nom,
      creeParId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath(CHEMIN);
  return null;
}

/** classeurId à null pour renvoyer un document vers la Boîte de réception. */
export async function deplacerDocumentFinancier(documentId: string, classeurId: string | null) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(documentFinancier).set({ classeurId }).where(eq(documentFinancier.id, documentId))
  );

  revalidatePath(CHEMIN);
}

/**
 * Rattache un document à une Facture ou un Paiement (l'un exclut l'autre,
 * comme "Add to" dans Zoho Books) — le rattachement fait sortir le document
 * de la Boîte de réception, comme chez Zoho ("clearing the inbox").
 */
export async function attacherDocumentFinancier(documentId: string, cible: { factureId?: string; paiementId?: string }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(documentFinancier)
      .set({ factureId: cible.factureId ?? null, paiementId: cible.paiementId ?? null })
      .where(eq(documentFinancier.id, documentId))
  );

  revalidatePath(CHEMIN);
}

const schemaMetadonnees = z.object({
  fournisseurOuVendeur: z.string().trim().optional(),
  montant: z.string().trim().optional(),
  dateDocument: z.string().trim().optional(),
});

/**
 * Saisie manuelle des champs que Zoho remplit par autoscan (OCR) — non
 * disponible ici, aucun fournisseur d'extraction n'étant configuré (voir
 * docs/crm-roadmap-post-commercialisation.md).
 */
export async function modifierMetadonneesDocumentFinancier(
  documentId: string,
  _etat: EtatDocumentFinancier,
  formData: FormData
): Promise<EtatDocumentFinancier> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier ce document." };
  }

  const analyse = schemaMetadonnees.safeParse({
    fournisseurOuVendeur: formData.get("fournisseurOuVendeur") || undefined,
    montant: formData.get("montant") || undefined,
    dateDocument: formData.get("dateDocument") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { fournisseurOuVendeur, montant, dateDocument } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(documentFinancier)
      .set({
        fournisseurOuVendeur: fournisseurOuVendeur || null,
        montant: montant ? Math.round(Number(montant)) : null,
        dateDocument: dateDocument ? new Date(dateDocument) : null,
      })
      .where(eq(documentFinancier.id, documentId))
  );

  revalidatePath(CHEMIN);
  return null;
}

/**
 * Droit à l'effacement réel (même principe que effacerDocument(), Palier 3)
 * — jamais une simple archive.
 */
export async function supprimerDocumentFinancier(documentId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "SUPPRIMER")) return;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDocument] = await tx.select().from(documentFinancier).where(eq(documentFinancier.id, documentId));
    if (!leDocument) return null;
    await tx.delete(documentFinancier).where(eq(documentFinancier.id, documentId));
    return leDocument;
  });
  if (!resultat) return;

  await effacerObjetStockage(resultat.cleStockage);
  revalidatePath(CHEMIN);
}
