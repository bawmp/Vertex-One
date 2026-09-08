"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { dossierRH, documentRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peutVoirSalaire } from "@/lib/rh/acces";
import { televerserDocument as televerserVersR2, effacerObjetStockage } from "@/lib/documents/stockage";

export type EtatDocumentRH = { erreur?: string } | null;

/**
 * Fichiers RH (échange du 2026-09-08, comparaison avec Zoho People —
 * "Employee Files") : réservé à l'Administrateur ou à l'intéressé
 * lui-même — même garde que le salaire (peutVoirSalaire(), réutilisée telle
 * quelle, voir src/lib/rh/acces.ts), jamais la portée RH normale d'un
 * Manager. Upload direct serveur (Buffer), jamais de presigned URL côté
 * client — même flux que televerserImageProduit()/ajouterDocument().
 */
export async function televerserDocumentRH(_etat: EtatDocumentRH, formData: FormData): Promise<EtatDocumentRH> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const dossierRHId = formData.get("dossierRHId");
  if (typeof dossierRHId !== "string" || !dossierRHId) {
    return { erreur: "Formulaire invalide." };
  }

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Sélectionnez un fichier." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));
    if (!leDossier) return { erreur: "Dossier RH introuvable." };
    if (!peutVoirSalaire(utilisateurConnecte, leDossier.utilisateurId)) {
      return { erreur: "Vous n'avez pas le droit d'ajouter un fichier à ce dossier." };
    }

    const contenu = Buffer.from(await fichier.arrayBuffer());
    const { televerse, cleStockage, erreur } = await televerserVersR2({
      entrepriseId: utilisateurConnecte.entrepriseId,
      nomFichier: fichier.name,
      typeMime: fichier.type || "application/octet-stream",
      contenu,
    });
    if (!televerse) return { erreur: erreur ?? "Échec du téléversement." };

    await tx.insert(documentRH).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierRHId,
      nom: fichier.name,
      cleStockage,
      typeMime: fichier.type || "application/octet-stream",
      tailleOctets: fichier.size,
      televerseParId: utilisateurConnecte.utilisateurId,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`/app/rh/${dossierRHId}`);
  return null;
}

export async function effacerDocumentRH(documentId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDocument] = await tx.select().from(documentRH).where(eq(documentRH.id, documentId));
    if (!leDocument) return null;

    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, leDocument.dossierRHId));
    if (!leDossier || !peutVoirSalaire(utilisateurConnecte, leDossier.utilisateurId)) return null;

    await tx.delete(documentRH).where(eq(documentRH.id, documentId));
    return leDocument;
  });

  if (!resultat) return;

  await effacerObjetStockage(resultat.cleStockage);
  revalidatePath(`/app/rh/${resultat.dossierRHId}`);
}
