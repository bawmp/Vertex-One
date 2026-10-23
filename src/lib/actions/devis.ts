"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, devis, ligneDevis, facture, projet, lienClientDocument } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants, formaterFCFA } from "@/lib/facturation/calcul";
import { genererNumeroDevis } from "@/lib/facturation/numerotation";
import { resoudreClientVente } from "@/lib/facturation/client-document";
import { recupererDevisPourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { expediteurDe } from "@/lib/email/expediteur";
import { recupererModele, interpoler, corpsVersHtml } from "@/lib/email/modeles";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { obtenirOuCreerLien, urlPubliqueDevis } from "@/lib/client-documents/liens";
import { journaliserEmailEnvoye, resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { lienEmail } from "@/lib/email/lien";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatDevis = { erreur?: string } | null;

/**
 * Bloque la création tant que le NIU n'est pas renseigné (docs/palier-1-*,
 * section 2) — sans lui, aucun devis émis ne serait conforme DGI. Le numéro
 * n'est PAS généré ici : un devis reste un brouillon jusqu'à son envoi, et
 * la numérotation ne concerne que les factures (section 5). On donne quand
 * même un numéro de brouillon lisible ("DEV-2026-000042") dès la création
 * pour l'affichage — voir note dans le code : à distinguer du numéro de
 * FACTURE, seul soumis à la contrainte stricte de séquence sans trou.
 */
export async function creerDevis(_etat: EtatDevis, formData: FormData): Promise<EtatDevis> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un devis.") };
  }

  const dealId = String(formData.get("dealId") ?? "") || undefined;
  const contactId = String(formData.get("contactId") ?? "") || undefined;
  const dateValidite = String(formData.get("dateValidite") ?? "");

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    produitId: formData.getAll("produitId")[i] || undefined,
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));

  const analyseLignes = z.array(schemaLigne).min(1, m("Au moins une ligne est requise.")).safeParse(lignesBrutes);
  if (!analyseLignes.success || (!dealId && !contactId) || !dateValidite) {
    return { erreur: analyseLignes.success ? t("Formulaire invalide.") : analyseLignes.error.issues[0]?.message };
  }

  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauDevis] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const client = await resoudreClientVente(tx, utilisateurConnecte, { dealId, contactId });
    if (!client) throw new Error("CLIENT_INTROUVABLE");

    const numero = await genererNumeroDevis(tx, utilisateurConnecte.entrepriseId);

    const [ligneDevisCree] = await tx
      .insert(devis)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: client.dealId,
        contactId: client.contactId,
        compteId: client.compteId,
        assigneAId: client.assigneAId,
        dateValidite: new Date(dateValidite),
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: devis.id });

    await tx.insert(ligneDevis).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        devisId: ligneDevisCree.id,
        produitId: l.produitId || undefined,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [ligneDevisCree];
  }).catch((erreur) => {
    if (erreur instanceof Error && (erreur.message === "NIU_MANQUANT" || erreur.message === "CLIENT_INTROUVABLE")) return [];
    throw erreur;
  });

  if (!nouveauDevis) {
    return { erreur: t("Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales), ou le client indiqué est introuvable.") };
  }

  redirect(`/app/facturation/devis/${nouveauDevis.id}`);
}

/**
 * Devis accepté → facture créée automatiquement dans le même mouvement
 * (docs/palier-1-*, section 6, étape 4), numéro de facture généré à cet
 * instant précis (jamais avant) via genererNumeroFacture(), dans la même
 * transaction que l'insertion — un échec de l'insertion annule aussi
 * l'incrémentation du compteur, donc jamais de trou dans la séquence.
 */
export async function accepterDevis(devisId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return;

  const idFactureCreee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    return accepterDevisEtCreerFacture(tx, utilisateurConnecte.entrepriseId, devisId);
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app/projets");
  revalidatePath("/app");

  if (idFactureCreee) redirect(`/app/facturation/factures/${idFactureCreee}`);
}

export type EtatEnvoiDevis = { erreur?: string; envoye?: boolean } | null;

/**
 * Supprime un devis EN BROUILLON (jamais envoyé : le client ne l'a pas vu, aucun document n'en découle). Un devis envoyé,
 * accepté, refusé ou expiré ne se supprime pas — il reste la trace de ce qui a été proposé au client. Jamais une facture :
 * la facturation n'a pas de suppression (voir CLAUDE.md). Droit de modifier la facturation + devis dans la portée de
 * l'utilisateur ; le statut est relu en base, jamais pris dans la requête. Le numéro d'un devis supprimé n'est pas réutilisé.
 */
export async function supprimerDevis(devisId: string, retourListe = false): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de supprimer ce devis.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
    const [d] = await tx.select().from(devis).where(and(eq(devis.id, devisId), eq(devis.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!d || (visibles !== "TOUT" && !visibles.includes(d.assigneAId))) return { erreur: t("Devis introuvable.") };
    if (d.statut !== "BROUILLON") return { erreur: t("Seul un devis en brouillon peut être supprimé. Un devis envoyé au client reste dans vos documents.") };

    // Garde-fou : rien ne doit dépendre de ce devis (impossible pour un brouillon, mais jamais de suppression « à l'aveugle »).
    const [uneFacture] = await tx.select({ id: facture.id }).from(facture).where(eq(facture.devisOrigineId, devisId)).limit(1);
    const [unProjet] = await tx.select({ id: projet.id }).from(projet).where(eq(projet.devisOrigineId, devisId)).limit(1);
    if (uneFacture || unProjet) return { erreur: t("Ce devis a déjà donné lieu à d'autres documents : il ne peut pas être supprimé.") };

    await tx.delete(lienClientDocument).where(eq(lienClientDocument.devisId, devisId));
    await tx.delete(ligneDevis).where(eq(ligneDevis.devisId, devisId));
    await tx.delete(devis).where(and(eq(devis.id, devisId), eq(devis.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { ok: true };
  });
  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };

  revalidatePath("/app/facturation");
  revalidatePath("/app/contacts");
  revalidatePath("/app/deals");
  if (retourListe) redirect("/app/facturation");
  return null;
}

/**
 * Objet et corps de l'email d'un devis, composés à UN seul endroit : l'envoi réel et l'aperçu avant envoi partent de
 * ce même texte, donc l'aperçu montre exactement ce que le client recevra.
 */
function composerEmailDevis(
  modele: { objet: string; corps: string },
  donnees: NonNullable<Awaited<ReturnType<typeof recupererDevisPourPDF>>>,
  entete: string,
  lien: string | null
): { sujet: string; html: string } {
  const variables = {
    client: donnees.client?.nom ?? "",
    numero: donnees.devis.numero,
    montant: formaterFCFA(donnees.devis.montantTTC),
    entreprise: donnees.entreprise.nom,
  };
  return {
    sujet: interpoler(modele.objet, variables),
    html: entete + corpsVersHtml(interpoler(modele.corps, variables)) + lienEmail(lien, "Consulter, accepter ou refuser ce devis en ligne"),
  };
}

export type ApercuEmailEnvoi = { erreur: string } | { destinataire: string | null; objet: string; corpsHtml: string; pieceJointe: string };

/**
 * Aperçu avant envoi : l'email tel qu'il partira (destinataire, objet, corps). Le PDF joint se montre à part, par
 * la même route que le téléchargement. Rien n'est envoyé ni enregistré ; le lien du devis en ligne n'est créé qu'à
 * l'envoi, l'aperçu en montre l'emplacement.
 */
export async function apercuEmailDevis(devisId: string): Promise<ApercuEmailEnvoi> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit d'envoyer ce devis.") };

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await recupererDevisPourPDF(tx, utilisateurConnecte, devisId);
    if (!donnees) return { erreur: t("Devis introuvable.") };
    const modele = await recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_DEVIS");
    const { sujet, html } = composerEmailDevis(modele, donnees, await enteteLogoEmail(utilisateurConnecte.entrepriseId), null);
    return { destinataire: donnees.client?.email ?? null, objet: sujet, corpsHtml: html, pieceJointe: `${donnees.devis.numero}.pdf` };
  });
}

/**
 * Envoi réel par email (Resend), pièce jointe PDF générée à la volée —
 * WhatsApp reste un TODO (API Meta Cloud non configurée, même traitement que
 * les autres intégrations externes de ce projet). Le statut ne passe à
 * ENVOYE que si l'email part effectivement : un échec (client sans email,
 * Resend indisponible) ne doit jamais laisser croire au client interne que
 * le devis est parti.
 */
export async function envoyerDevis(devisId: string, _etat: EtatEnvoiDevis, _formData: FormData): Promise<EtatEnvoiDevis> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit d'envoyer ce devis.") };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await recupererDevisPourPDF(tx, utilisateurConnecte, devisId);
    if (!donnees) return { erreur: t("Devis introuvable.") };
    if (!donnees.client?.email) {
      return { erreur: t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).") };
    }

    const jetonClient = await obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { devisId });

    const [modele, buffer] = await Promise.all([
      recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_DEVIS"),
      rendreDocumentCommercialPDF({
        typeDocument: "DEVIS",
        numero: donnees.devis.numero,
        dateEmission: donnees.devis.creeLe,
        dateEcheanceOuValidite: donnees.devis.dateValidite,
        labelDateSecondaire: "Valide jusqu'au",
        entreprise: donnees.entreprise,
        client: donnees.client,
        lignes: donnees.lignes,
        montantHT: donnees.devis.montantHT,
        montantTVA: donnees.devis.montantTVA,
        montantTTC: donnees.devis.montantTTC,
      }),
    ]);

    const { sujet, html } = composerEmailDevis(modele, donnees, await enteteLogoEmail(utilisateurConnecte.entrepriseId), urlPubliqueDevis(jetonClient));
    const piecesJointes = [{ filename: `${donnees.devis.numero}.pdf`, content: buffer }];
    const { envoye, erreur } = await envoyerEmail({
      to: donnees.client.email,
      subject: sujet,
      html,
      attachments: piecesJointes,
      ...(await expediteurDe(tx, utilisateurConnecte)),
    });

    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'email.") };

    await journaliserEmailEnvoye(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      contactId: donnees.devis.contactId,
      auteurId: utilisateurConnecte.utilisateurId,
      sujet,
      souche: { destinataire: donnees.client.email, html, piecesJointes: resumePiecesJointes(piecesJointes), type: "DEVIS" },
    });
    await tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, devisId));
    return { envoye: true };
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  return resultat;
}
