"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { contact, contrat, dossier, document, interaction } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles, dossiersVisibles } from "@/lib/portee";
import { lireObjetStockage } from "@/lib/documents/stockage";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { expediteurDe } from "@/lib/email/expediteur";
import { corpsVersHtml } from "@/lib/email/modeles";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { journaliserEmailEnvoye } from "@/lib/crm/journaliser-email";
import {
  recupererBonCommandeVentePourPDF,
  recupererRecuVentePourPDF,
  recupererFactureAcomptePourPDF,
  recupererDevisPourPDF,
  recupererFacturePourPDF,
} from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatEmailClient = { erreur?: string; envoye?: boolean } | null;

export type TypeDocumentVente = "BON_COMMANDE" | "RECU_VENTE" | "FACTURE_ACOMPTE";

const LIBELLE_DOCUMENT: Record<TypeDocumentVente, { article: string; nom: string }> = {
  BON_COMMANDE: { article: "le", nom: "bon de commande" },
  RECU_VENTE: { article: "le", nom: "reçu de vente" },
  FACTURE_ACOMPTE: { article: "la", nom: "facture d'acompte" },
};

/**
 * « Envoyer par email » pour les documents de vente qui n'avaient qu'un PDF à télécharger : bon de commande, reçu de
 * vente, facture d'acompte (devis et factures ont leur propre action, src/lib/actions/{devis,facture}.ts). Même
 * principe : envoi RÉEL par Resend avec le PDF généré à la volée, destinataire relu en base depuis le contact du
 * document (jamais une valeur du navigateur), portée Facturation appliquée par les chargeurs de données. Un échec
 * (client sans email, Resend indisponible) est renvoyé tel quel : jamais « envoyé » sans qu'un email soit parti.
 */
export async function envoyerDocumentVente(type: TypeDocumentVente, documentId: string, _etat: EtatEmailClient, _formData: FormData): Promise<EtatEmailClient> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit d'envoyer ce document.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatEmailClient> => {
    let numero: string;
    let montant: number;
    let contactId: string;
    let client: { nom: string; email: string | null };
    let nomEntreprise: string;
    let buffer: Buffer;

    if (type === "BON_COMMANDE") {
      const d = await recupererBonCommandeVentePourPDF(tx, utilisateurConnecte, documentId);
      if (!d) return { erreur: t("Document introuvable.") };
      numero = d.bonCommandeVente.numero;
      montant = d.bonCommandeVente.montantTTC;
      contactId = d.bonCommandeVente.contactId;
      client = d.client;
      nomEntreprise = d.entreprise.nom;
      buffer = await rendreDocumentCommercialPDF({
        typeDocument: "BON_COMMANDE",
        numero,
        dateEmission: d.bonCommandeVente.dateCommande,
        entreprise: d.entreprise,
        client: d.client,
        lignes: d.lignes,
        montantHT: d.bonCommandeVente.montantHT,
        montantTVA: d.bonCommandeVente.montantTVA,
        montantTTC: d.bonCommandeVente.montantTTC,
      });
    } else if (type === "RECU_VENTE") {
      const d = await recupererRecuVentePourPDF(tx, utilisateurConnecte, documentId);
      if (!d) return { erreur: t("Document introuvable.") };
      numero = d.recuVente.numero;
      montant = d.recuVente.montantTTC;
      contactId = d.recuVente.contactId;
      client = d.client;
      nomEntreprise = d.entreprise.nom;
      buffer = await rendreDocumentCommercialPDF({
        typeDocument: "RECU_VENTE",
        numero,
        dateEmission: d.recuVente.dateEmission,
        entreprise: d.entreprise,
        client: d.client,
        lignes: d.lignes,
        montantHT: d.recuVente.montantHT,
        montantTVA: d.recuVente.montantTVA,
        montantTTC: d.recuVente.montantTTC,
        moyenPaiement: d.moyenPaiementLibelle,
      });
    } else {
      const d = await recupererFactureAcomptePourPDF(tx, utilisateurConnecte, documentId);
      if (!d) return { erreur: t("Document introuvable.") };
      numero = d.factureAcompte.numero;
      montant = d.factureAcompte.montant;
      contactId = d.factureAcompte.contactId;
      client = d.client;
      nomEntreprise = d.entreprise.nom;
      buffer = await rendreDocumentCommercialPDF({
        typeDocument: "FACTURE_ACOMPTE",
        numero,
        dateEmission: d.factureAcompte.dateEmission,
        entreprise: d.entreprise,
        client: d.client,
        montantTTC: d.factureAcompte.montant,
        montantRestant: d.factureAcompte.montantRestant,
        moyenPaiement: d.moyenPaiementLibelle ?? undefined,
      });
    }

    if (!client.email) return { erreur: t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).") };

    const lib = LIBELLE_DOCUMENT[type];
    const sujet = `${lib.nom.charAt(0).toUpperCase()}${lib.nom.slice(1)} ${numero} — ${nomEntreprise}`;
    const corps = `Bonjour ${client.nom},\n\nVeuillez trouver ci-joint ${lib.article} ${lib.nom} ${numero} d'un montant de ${formaterFCFA(montant)}.\n\nCordialement,\n${nomEntreprise}`;

    const { envoye, erreur } = await envoyerEmail({
      to: client.email,
      subject: sujet,
      html: (await enteteLogoEmail(utilisateurConnecte.entrepriseId)) + corpsVersHtml(corps),
      attachments: [{ filename: `${numero}.pdf`, content: buffer }],
      ...(await expediteurDe(tx, utilisateurConnecte)),
    });
    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'email.") };

    await journaliserEmailEnvoye(tx, { entrepriseId: utilisateurConnecte.entrepriseId, contactId, auteurId: utilisateurConnecte.utilisateurId, sujet });
    return { envoye: true };
  });

  revalidatePath("/app/facturation");
  revalidatePath("/app/contacts");
  return resultat;
}

const schemaMessage = z.object({
  contactId: z.string().min(1),
  devisId: z.string().optional(),
  factureId: z.string().optional(),
  objet: z.string().trim().min(2, m("L'objet est requis.")).max(200, m("L'objet est trop long (200 caractères maximum).")),
  message: z.string().trim().min(1, m("Le message ne peut pas être vide.")).max(5000, m("Le message est trop long (5 000 caractères maximum).")),
});

/**
 * Écrire directement au client depuis sa fiche One CRM, ou depuis un devis / une facture de One Books. Le destinataire
 * est TOUJOURS l'email du contact relu en base : jamais une adresse venue du formulaire. Depuis One Books, c'est le
 * devis ou la facture (soumis à la portée Facturation) qui désigne le contact ; depuis la fiche, la portée CRM
 * s'applique. L'email part au nom de l'entreprise (logo, nom affiché), les réponses arrivent à l'expéditeur, et le
 * message est journalisé dans l'historique du contact.
 */
export async function envoyerMessageClient(_etat: EtatEmailClient, formData: FormData): Promise<EtatEmailClient> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const analyse = schemaMessage.safeParse({
    contactId: formData.get("contactId"),
    devisId: formData.get("devisId") || undefined,
    factureId: formData.get("factureId") || undefined,
    objet: formData.get("objet"),
    message: formData.get("message"),
  });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const depuisBooks = !!(d.devisId || d.factureId);
  if (depuisBooks ? !peut(utilisateurConnecte, "FACTURATION", "MODIFIER") : !peut(utilisateurConnecte, "CRM", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit d'écrire à ce client.") };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatEmailClient> => {
    // Le contact est désigné par le document de vente (One Books) ou vérifié dans la portée CRM (fiche contact).
    let contactIdEffectif: string | null = null;
    if (d.devisId) {
      const doc = await recupererDevisPourPDF(tx, utilisateurConnecte, d.devisId);
      contactIdEffectif = doc?.devis.contactId ?? null;
    } else if (d.factureId) {
      const doc = await recupererFacturePourPDF(tx, utilisateurConnecte, d.factureId);
      contactIdEffectif = doc?.facture.contactId ?? null;
    } else {
      contactIdEffectif = d.contactId;
    }
    if (!contactIdEffectif || contactIdEffectif !== d.contactId) return { erreur: t("Contact introuvable.") };

    const [leContact] = await tx.select().from(contact).where(eq(contact.id, contactIdEffectif));
    if (!leContact) return { erreur: t("Contact introuvable.") };
    if (!depuisBooks) {
      const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
      if (visibles !== "TOUT" && !visibles.includes(leContact.assigneAId)) return { erreur: t("Contact introuvable.") };
    }
    if (!leContact.email) return { erreur: t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).") };

    const expediteur = await expediteurDe(tx, utilisateurConnecte);
    const { envoye, erreur } = await envoyerEmail({
      to: leContact.email,
      subject: d.objet,
      html: (await enteteLogoEmail(utilisateurConnecte.entrepriseId)) + corpsVersHtml(d.message),
      ...expediteur,
    });
    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'email.") };

    // Le message lui-même (pas seulement l'objet) reste dans l'historique du contact.
    await tx.insert(interaction).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      contactId: leContact.id,
      type: "email",
      contenu: `${d.objet}\n\n${d.message}`.slice(0, 5000),
      auteurId: utilisateurConnecte.utilisateurId,
    });
    return { envoye: true };
  });

  revalidatePath(`/app/contacts/${d.contactId}`);
  return resultat;
}

/**
 * Envoyer par email un document d'un contrat (le contrat lui-même, un avenant…) au client du dossier, sans demande de
 * signature (le bouton « Envoyer le contrat au client » existant sert à faire signer). Seuls les documents ordinaires
 * (catégorie GENERAL) du MÊME dossier que le contrat partent : une pièce d'identité ou de santé n'est jamais envoyée
 * par cette voie, quel que soit l'identifiant reçu.
 */
export async function envoyerContratParEmail(contratId: string, _etat: EtatEmailClient, formData: FormData): Promise<EtatEmailClient> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CONTRATS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit d'envoyer ce contrat.") };

  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return { erreur: t("Sélectionnez le document à envoyer.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatEmailClient & { dossierId?: string }> => {
    const [leContrat] = await tx.select().from(contrat).where(eq(contrat.id, contratId));
    if (!leContrat) return { erreur: t("Contrat introuvable.") };

    const dossiers = await dossiersVisibles(tx, utilisateurConnecte);
    if (dossiers !== "TOUT" && !dossiers.includes(leContrat.dossierId)) return { erreur: t("Contrat introuvable.") };

    const [leDossier] = await tx.select().from(dossier).where(eq(dossier.id, leContrat.dossierId));
    const [leContact] = leDossier ? await tx.select().from(contact).where(eq(contact.id, leDossier.contactId)) : [];
    if (!leContact) return { erreur: t("Contact introuvable.") };
    if (!leContact.email) return { erreur: t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).") };

    const [leDocument] = await tx
      .select()
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.dossierId, leContrat.dossierId), eq(document.categorie, "GENERAL")));
    if (!leDocument) return { erreur: t("Document introuvable.") };

    const contenu = await lireObjetStockage(leDocument.cleStockage);
    if (!contenu) return { erreur: t("Impossible de lire le contenu du document (stockage R2 non configuré ou fichier introuvable).") };

    const [expediteur, entete] = await Promise.all([expediteurDe(tx, utilisateurConnecte), enteteLogoEmail(utilisateurConnecte.entrepriseId)]);
    const nomEntreprise = expediteur.nomExpediteur ?? "";
    const sujet = `${leContrat.titre} — ${nomEntreprise}`.replace(/ — $/, "");
    const corps = `Bonjour ${leContact.nom},\n\nVeuillez trouver ci-joint le document « ${leDocument.nom} » relatif à votre contrat « ${leContrat.titre} ».\n\nCordialement,\n${nomEntreprise}`;

    const { envoye, erreur } = await envoyerEmail({
      to: leContact.email,
      subject: sujet,
      html: entete + corpsVersHtml(corps),
      attachments: [{ filename: leDocument.nom, content: contenu }],
      ...expediteur,
    });
    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'email.") };

    await journaliserEmailEnvoye(tx, { entrepriseId: utilisateurConnecte.entrepriseId, contactId: leContact.id, auteurId: utilisateurConnecte.utilisateurId, sujet });
    return { envoye: true, dossierId: leContrat.dossierId };
  });

  if (resultat?.dossierId) revalidatePath(`/app/projets/dossiers/${resultat.dossierId}`);
  return resultat ? { erreur: resultat.erreur, envoye: resultat.envoye } : null;
}
