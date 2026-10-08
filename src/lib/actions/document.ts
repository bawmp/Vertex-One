"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { document, journalAccesDocument, demandeSuppressionDocument, dossier, projet, contact, categorieDocument } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { televerserDocument as televerserVersR2, effacerObjetStockage } from "@/lib/documents/stockage";
import { peutVoirDocumentSensible, estCategorieSensible, responsableDuDocument, peutSupprimerDocument } from "@/lib/documents/acces";
import { getT } from "@/lib/i18n/langue";

const schemaDocument = z.object({
  dossierId: z.string().nullable(),
  projetId: z.string().nullable(),
  contactId: z.string().nullable(),
  categorie: z.enum(categorieDocument.enumValues),
});

export type EtatDocument = { erreur?: string } | null;

/**
 * Responsable à qui rattacher la restriction de sensibilité d'un document : celui de son Dossier (directement ou via
 * son Projet), sinon, pour une pièce privée déposée depuis une fiche One CRM, celui du contact. Une seule source de
 * vérité pour le journal d'accès ET la suppression, afin qu'elles ne divergent jamais.
 */
async function responsableDuDocumentEnBase(tx: TransactionDrizzle, d: typeof document.$inferSelect): Promise<string | null> {
  const idDossier = d.dossierId ?? (d.projetId ? ((await tx.select({ dossierId: projet.dossierId }).from(projet).where(eq(projet.id, d.projetId)))[0]?.dossierId ?? null) : null);
  const responsableDossierId = idDossier ? ((await tx.select({ r: dossier.responsableId }).from(dossier).where(eq(dossier.id, idDossier)))[0]?.r ?? null) : null;
  const responsableContactId = d.contactId ? ((await tx.select({ r: contact.assigneAId }).from(contact).where(eq(contact.id, d.contactId)))[0]?.r ?? null) : null;
  return responsableDuDocument({ responsableDossierId, responsableContactId });
}

type UtilisateurSession = NonNullable<Awaited<ReturnType<typeof recupererUtilisateurConnecte>>>;

/**
 * Le document est-il accessible à cet utilisateur ? Sensible, ou rattaché à un Dossier/Projet : restriction par
 * responsable. Sinon (document autonome) : portée du rôle sur le module DOCUMENTS via le téléverseur. Utilisé par
 * le journal d'accès ET la demande de suppression, pour qu'on ne puisse demander la suppression que de ce qu'on voit.
 */
async function peutAccederAuDocument(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurSession, leDocument: typeof document.$inferSelect): Promise<boolean> {
  if (leDocument.dossierId || leDocument.projetId || (leDocument.contactId && estCategorieSensible(leDocument.categorie))) {
    return peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, await responsableDuDocumentEnBase(tx, leDocument));
  }
  const visibles = await idsVisibles(tx, utilisateurConnecte, "DOCUMENTS");
  return visibles === "TOUT" || visibles.includes(leDocument.televerseParId);
}

/**
 * Suppression réelle en base (journal + demandes en attente + ligne). `issue` : APPROUVEE quand c'est
 * l'Administrateur qui supprime (directement ou en validant une demande), SANS_OBJET quand l'auteur retire lui-même
 * son document alors qu'une demande attendait encore. Le fichier R2 est effacé par l'appelant, après la transaction.
 */
async function supprimerEnBase(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurSession, leDocument: typeof document.$inferSelect, issue: "APPROUVEE" | "SANS_OBJET") {
  await tx.insert(journalAccesDocument).values({
    entrepriseId: utilisateurConnecte.entrepriseId,
    documentId: leDocument.id,
    utilisateurId: utilisateurConnecte.utilisateurId,
    action: "suppression",
  });
  await tx
    .update(demandeSuppressionDocument)
    .set({ statut: issue, traiteParId: utilisateurConnecte.utilisateurId, traiteLe: new Date() })
    .where(and(eq(demandeSuppressionDocument.documentId, leDocument.id), eq(demandeSuppressionDocument.statut, "EN_ATTENTE")));
  await tx.delete(document).where(eq(document.id, leDocument.id));
}

function revaliderDocument(d: { dossierId: string | null; projetId: string | null; contactId: string | null }) {
  if (d.dossierId) revalidatePath(`/app/projets/dossiers/${d.dossierId}`);
  if (d.projetId) revalidatePath(`/app/projets/${d.projetId}`);
  if (d.contactId) revalidatePath(`/app/contacts/${d.contactId}`);
  revalidatePath("/app/documents");
}

export async function ajouterDocument(_etat: EtatDocument, formData: FormData): Promise<EtatDocument> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "DOCUMENTS", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit d'ajouter un document.") };
  }

  const analyse = schemaDocument.safeParse({
    dossierId: (formData.get("dossierId") as string) || null,
    projetId: (formData.get("projetId") as string) || null,
    contactId: (formData.get("contactId") as string) || null,
    categorie: formData.get("categorie") || "GENERAL",
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? t("Formulaire invalide.") };
  }
  const { dossierId, projetId } = analyse.data;
  // Document autonome (échange du 2026-09-08, comparaison avec le module
  // Documents de Zoho Books : "les fichiers peuvent venir de n'importe où")
  // — jamais sensible : aucun Dossier auquel rattacher la restriction de
  // PIECE_IDENTITE/DONNEES_SANTE (voir src/lib/documents/acces.ts). Imposé
  // ici, jamais laissé à la seule discipline du formulaire.
  // Exception (2026-10-08) : une pièce privée peut être déposée depuis la fiche One CRM d'un contact (sans Dossier),
  // son responsable étant alors celui du contact — voir la vérification dans la transaction ci-dessous.
  const categorie = !dossierId && !projetId && !analyse.data.contactId ? "GENERAL" : analyse.data.categorie;
  const sensibleSurContact = !dossierId && !projetId && !!analyse.data.contactId && estCategorieSensible(categorie);
  if (sensibleSurContact && formData.get("consentement") !== "on") {
    return { erreur: t("Confirmez que le client a donné son consentement avant d'enregistrer une pièce privée.") };
  }

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: t("Sélectionnez un fichier.") };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserVersR2({
    entrepriseId: utilisateurConnecte.entrepriseId,
    nomFichier: fichier.name,
    typeMime: fichier.type || "application/octet-stream",
    contenu,
  });

  if (!televerse) {
    return { erreur: erreur ?? t("Échec du téléversement.") };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // Un document rattaché à un Dossier hérite toujours du contact de ce dossier (jamais une valeur du
    // formulaire) — pour rester retrouvable depuis la fiche Contact sans changer le flux d'upload existant.
    // Sans dossierId, le contactId soumis (upload direct depuis la fiche Contact) est revérifié en base,
    // jamais fait confiance tel quel.
    let contactIdEffectif: string | null = null;
    if (dossierId) {
      const [leDossier] = await tx.select({ contactId: dossier.contactId }).from(dossier).where(eq(dossier.id, dossierId));
      contactIdEffectif = leDossier?.contactId ?? null;
    } else if (analyse.data.contactId) {
      const [leContact] = await tx.select({ id: contact.id, assigneAId: contact.assigneAId }).from(contact).where(eq(contact.id, analyse.data.contactId));
      if (!leContact) return { erreur: t("Contact introuvable.") };
      // Portée One CRM : on n'attache rien à un contact que l'on ne voit pas, même en connaissant son identifiant.
      const contactsVisibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
      if (contactsVisibles !== "TOUT" && !contactsVisibles.includes(leContact.assigneAId)) return { erreur: t("Contact introuvable.") };
      // Seuls l'Administrateur et le responsable du contact déposent (donc peuvent relire) une pièce privée.
      if (sensibleSurContact && !peutVoirDocumentSensible(utilisateurConnecte, categorie, leContact.assigneAId)) {
        return { erreur: t("Seul l'administrateur ou le responsable de ce contact peut y ajouter une pièce privée.") };
      }
      contactIdEffectif = leContact.id;
    }

    const [ajoute] = await tx.insert(document).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      dossierId,
      projetId,
      contactId: contactIdEffectif,
      categorie,
      nom: fichier.name,
      cleStockage,
      typeMime: fichier.type || "application/octet-stream",
      tailleOctets: fichier.size,
      televerseParId: utilisateurConnecte.utilisateurId,
    }).returning({ id: document.id });
    // Trace du dépôt et de l'attestation de consentement (registre de traitement, loi sur les données personnelles).
    if (sensibleSurContact && ajoute) {
      await tx.insert(journalAccesDocument).values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        documentId: ajoute.id,
        utilisateurId: utilisateurConnecte.utilisateurId,
        action: "depot_consentement_atteste",
      });
    }
    return null;
  });
  if (resultat?.erreur) return resultat;

  if (dossierId) revalidatePath(`/app/projets/dossiers/${dossierId}`);
  if (projetId) revalidatePath(`/app/projets/${projetId}`);
  if (analyse.data.contactId) revalidatePath(`/app/contacts/${analyse.data.contactId}`);
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

    const autorise = await peutAccederAuDocument(tx, utilisateurConnecte, leDocument);

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
  // Droit de suppression générale (Administrateur), ou auteur du téléversement avec le droit de voir les documents :
  // chacun peut retirer ce qu'il a ajouté par erreur (2026-10-08).
  const droitSuppressionGenerale = peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER");
  if (!droitSuppressionGenerale && !peut(utilisateurConnecte, "DOCUMENTS", "VOIR")) return;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDocument] = await tx.select().from(document).where(eq(document.id, documentId));
    if (!leDocument) return null;

    if (!peutSupprimerDocument(utilisateurConnecte.utilisateurId, leDocument.televerseParId, droitSuppressionGenerale)) return null;

    // On ne supprime pas ce qu'on n'a pas le droit de voir : même restriction de sensibilité que la consultation.
    if (!peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, await responsableDuDocumentEnBase(tx, leDocument))) {
      return null;
    }

    await supprimerEnBase(tx, utilisateurConnecte, leDocument, droitSuppressionGenerale ? "APPROUVEE" : "SANS_OBJET");

    return leDocument;
  });

  if (!resultat) return;
  await effacerObjetStockage(resultat.cleStockage);
  revaliderDocument(resultat);
}

export type EtatDemandeSuppression = { erreur?: string; ok?: true };

/**
 * Quelqu'un qui n'a pas ajouté un document (et n'est pas Administrateur) en demande la suppression : rien n'est
 * supprimé, l'Administrateur est mis en situation de décider et voit QUI l'a demandée, avec son motif (2026-10-08).
 * Il faut avoir accès au document (même règle que pour le consulter) : on ne demande pas la suppression de ce qu'on
 * ne voit pas.
 */
export async function demanderSuppressionDocument(documentId: string, motif: string): Promise<EtatDemandeSuppression> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "DOCUMENTS", "VOIR")) return { erreur: t("Vous n'avez pas le droit de demander la suppression d'un document.") };

  const motifPropre = motif.trim().slice(0, 500);
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatDemandeSuppression & { document?: typeof document.$inferSelect }> => {
    const [leDocument] = await tx.select().from(document).where(eq(document.id, documentId));
    if (!leDocument || !(await peutAccederAuDocument(tx, utilisateurConnecte, leDocument))) return { erreur: t("Document introuvable.") };

    if (peutSupprimerDocument(utilisateurConnecte.utilisateurId, leDocument.televerseParId, peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER"))) {
      return { erreur: t("Vous pouvez supprimer ce document directement.") };
    }
    const [dejaDemandee] = await tx
      .select({ id: demandeSuppressionDocument.id })
      .from(demandeSuppressionDocument)
      .where(and(eq(demandeSuppressionDocument.documentId, documentId), eq(demandeSuppressionDocument.statut, "EN_ATTENTE")));
    if (dejaDemandee) return { erreur: t("Une demande de suppression est déjà en attente pour ce document.") };

    await tx.insert(demandeSuppressionDocument).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      documentId,
      documentNom: leDocument.nom,
      demandeParId: utilisateurConnecte.utilisateurId,
      motif: motifPropre || null,
    });
    return { ok: true, document: leDocument };
  });
  if (resultat.erreur || !resultat.document) return { erreur: resultat.erreur ?? t("Document introuvable.") };

  revaliderDocument(resultat.document);
  return { ok: true };
}

/**
 * Décision de l'Administrateur sur une demande de suppression. Seul le droit de suppression générale (Administrateur)
 * peut trancher ; approuver supprime réellement le document (fichier R2 compris), refuser le conserve. Le demandeur
 * et l'auteur de la décision restent consignés dans la demande et dans le journal d'accès.
 */
export async function traiterDemandeSuppressionDocument(demandeId: string, decision: "APPROUVER" | "REFUSER"): Promise<EtatDemandeSuppression> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "DOCUMENTS", "SUPPRIMER")) return { erreur: t("Seul l'administrateur peut traiter une demande de suppression.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatDemandeSuppression & { document?: typeof document.$inferSelect }> => {
    const [laDemande] = await tx.select().from(demandeSuppressionDocument).where(eq(demandeSuppressionDocument.id, demandeId));
    if (!laDemande || laDemande.statut !== "EN_ATTENTE") return { erreur: t("Cette demande a déjà été traitée.") };

    const [leDocument] = await tx.select().from(document).where(eq(document.id, laDemande.documentId));
    if (!leDocument) {
      await tx.update(demandeSuppressionDocument).set({ statut: "SANS_OBJET", traiteParId: utilisateurConnecte.utilisateurId, traiteLe: new Date() }).where(eq(demandeSuppressionDocument.id, demandeId));
      return { erreur: t("Ce document n'existe plus.") };
    }
    // L'Administrateur voit tout, mais la règle de sensibilité reste appliquée de bout en bout (jamais de contournement).
    if (!peutVoirDocumentSensible(utilisateurConnecte, leDocument.categorie, await responsableDuDocumentEnBase(tx, leDocument))) return { erreur: t("Document introuvable.") };

    if (decision === "REFUSER") {
      await tx.update(demandeSuppressionDocument).set({ statut: "REFUSEE", traiteParId: utilisateurConnecte.utilisateurId, traiteLe: new Date() }).where(eq(demandeSuppressionDocument.id, demandeId));
      return { ok: true, document: leDocument };
    }
    await supprimerEnBase(tx, utilisateurConnecte, leDocument, "APPROUVEE");
    return { ok: true, document: leDocument };
  });
  if (resultat.erreur || !resultat.document) return { erreur: resultat.erreur ?? t("Document introuvable.") };

  if (decision === "APPROUVER") await effacerObjetStockage(resultat.document.cleStockage);
  revaliderDocument(resultat.document);
  return { ok: true };
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
  if (!peut(utilisateurConnecte, "DOSSIERS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(dossier).set({ consentementDonneesLe: new Date() }).where(eq(dossier.id, dossierId))
  );

  revalidatePath(`/app/projets/dossiers/${dossierId}`);
}
