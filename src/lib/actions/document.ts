"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { document, journalAccesDocument, dossier, categorieDocument } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { televerserDocument as televerserVersR2, effacerObjetStockage } from "@/lib/documents/stockage";
import { peutVoirDocumentSensible } from "@/lib/documents/acces";

const schemaDocument = z.object({
  dossierId: z.string().nullable(),
  projetId: z.string().nullable(),
  categorie: z.enum(categorieDocument.enumValues),
});

export type EtatDocument = { erreur?: string } | null;

export async function ajouterDocument(_etat: EtatDocument, formData: FormData): Promise<EtatDocument> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOCUMENTS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit d'ajouter un document." };
  }

  const analyse = schemaDocument.safeParse({
    dossierId: (formData.get("dossierId") as string) || null,
    projetId: (formData.get("projetId") as string) || null,
    categorie: formData.get("categorie") || "GENERAL",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { dossierId, projetId, categorie } = analyse.data;
  if (!dossierId && !projetId) {
    return { erreur: "Un document doit être rattaché à un dossier ou un projet." };
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
    tx.insert(document).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierId,
      projetId,
      categorie,
      nom: fichier.name,
      cleStockage,
      typeMime: fichier.type || "application/octet-stream",
      tailleOctets: fichier.size,
      televerseParId: utilisateurConnecte.utilisateurId,
    })
  );

  if (dossierId) revalidatePath(`/app/projets/dossiers/${dossierId}`);
  if (projetId) revalidatePath(`/app/projets/${projetId}`);
  return null;
}

/**
 * Palier 3, section 9 — chaque consultation/téléchargement d'un document
 * classé sensible crée une ligne dans JournalAccesDocument, y compris pour
 * un Administrateur (le registre de traitement n'exempte personne).
 */
export async function journaliserAccesDocument(documentId: string, action: "consultation" | "telechargement") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const [leDocument] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select().from(document).where(eq(document.id, documentId))
  );
  if (!leDocument) return { autorise: false as const };

  if (leDocument.dossierId) {
    const [leDossier] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
      tx.select({ responsableId: dossier.responsableId }).from(dossier).where(eq(dossier.id, leDocument.dossierId!))
    );
    if (!peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, leDossier?.responsableId ?? null)) {
      return { autorise: false as const };
    }
  }

  if (leDocument.categorie !== "GENERAL") {
    await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
      tx.insert(journalAccesDocument).values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        documentId,
        utilisateurId: utilisateurConnecte.utilisateurId,
        action,
      })
    );
  }

  return { autorise: true as const, cleStockage: leDocument.cleStockage };
}

/**
 * Droit à l'effacement (docs/palier-3-*, section 9) : suppression réelle du
 * fichier (R2) et de la ligne, jamais une simple archive — contrairement à
 * une facture (Palier 1), un document personnel doit pouvoir disparaître
 * vraiment sur demande légitime.
 */
export async function effacerDocument(documentId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOCUMENTS", "SUPPRIMER")) return;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDocument] = await tx.select().from(document).where(eq(document.id, documentId));
    if (!leDocument) return null;

    if (leDocument.dossierId) {
      const [leDossier] = await tx.select({ responsableId: dossier.responsableId }).from(dossier).where(eq(dossier.id, leDocument.dossierId));
      if (!peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, leDossier?.responsableId ?? null)) {
        return null;
      }
    }

    await tx.insert(journalAccesDocument).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      documentId,
      utilisateurId: utilisateurConnecte.utilisateurId,
      action: "suppression",
    });
    await tx.delete(document).where(eq(document.id, documentId));

    return leDocument;
  });

  if (!resultat) return;
  await effacerObjetStockage(resultat.cleStockage);

  if (resultat.dossierId) revalidatePath(`/app/projets/dossiers/${resultat.dossierId}`);
  if (resultat.projetId) revalidatePath(`/app/projets/${resultat.projetId}`);
}

/**
 * Consentement explicite requis avant tout stockage de pièce sensible (loi
 * camerounaise de protection des données, docs/palier-3-*, section 9) —
 * l'application avertit sans bloquer, l'enregistrement du consentement lui-
 * même reste un geste explicite du responsable du dossier ou d'un Admin.
 */
export async function enregistrerConsentement(dossierId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "DOSSIERS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(dossier).set({ consentementDonneesLe: new Date() }).where(eq(dossier.id, dossierId))
  );

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
}
