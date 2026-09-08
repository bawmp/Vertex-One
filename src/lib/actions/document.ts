"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { document, journalAccesDocument, dossier, projet, categorieDocument } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
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
  const { dossierId, projetId } = analyse.data;
  // Document autonome (échange du 2026-09-08, comparaison avec le module
  // Documents de Zoho Books : "les fichiers peuvent venir de n'importe où")
  // — jamais sensible : aucun Dossier auquel rattacher la restriction de
  // PIECE_IDENTITE/DONNEES_SANTE (voir src/lib/documents/acces.ts). Imposé
  // ici, jamais laissé à la seule discipline du formulaire.
  const categorie = !dossierId && !projetId ? "GENERAL" : analyse.data.categorie;

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
  revalidatePath("/app/documents");
  return null;
}

/**
 * Palier 3, section 9 — chaque consultation/téléchargement d'un document
 * classé sensible crée une ligne dans JournalAccesDocument, y compris pour
 * un Administrateur (le registre de traitement n'exempte personne).
 *
 * Deux corrections apportées le 2026-09-08 en construisant les documents
 * autonomes : (1) un document rattaché seulement à un Projet (sans
 * dossierId direct) ne bénéficiait d'AUCUNE restriction de sensibilité —
 * corrigé en remontant jusqu'au Dossier du Projet (chaque Projet appartient
 * toujours à un Dossier, voir schema.ts) ; (2) un document autonome (ni
 * Dossier ni Projet) n'était filtré par aucune portée — jamais sensible
 * (imposé à la création), mais doit quand même respecter la portée du rôle
 * sur le module DOCUMENTS via son propre televerseParId, même patron que la
 * page liste (src/app/app/documents/page.tsx).
 */
export async function journaliserAccesDocument(documentId: string, action: "consultation" | "telechargement") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDocument] = await tx.select().from(document).where(eq(document.id, documentId));
    if (!leDocument) return null;

    let autorise: boolean;
    if (leDocument.dossierId || leDocument.projetId) {
      const idDossierEffectif =
        leDocument.dossierId ?? (await tx.select({ dossierId: projet.dossierId }).from(projet).where(eq(projet.id, leDocument.projetId!)))[0]?.dossierId ?? null;
      const [leDossier] = idDossierEffectif ? await tx.select({ responsableId: dossier.responsableId }).from(dossier).where(eq(dossier.id, idDossierEffectif)) : [];
      autorise = peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, leDossier?.responsableId ?? null);
    } else {
      const visibles = await idsVisibles(tx, utilisateurConnecte, "DOCUMENTS");
      autorise = visibles === "TOUT" || visibles.includes(leDocument.televerseParId);
    }

    return { leDocument, autorise };
  });
  if (!resultat || !resultat.autorise) return { autorise: false as const };
  const { leDocument } = resultat;

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
