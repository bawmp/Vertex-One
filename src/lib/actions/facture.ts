"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { facture, paiement, avoirFacture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { recupererFacturePourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { envoyerEmail } from "@/lib/email/client";
import { recupererModele, interpoler, corpsVersHtml } from "@/lib/email/modeles";
import { genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { creerLienPaiementFacture } from "@/lib/facturation/paiement-en-ligne";
import { obtenirOuCreerLien, urlPubliqueFacture } from "@/lib/client-documents/liens";
import { getT } from "@/lib/i18n/langue";

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Forfait Starter (docs/palier-1-*, section 6, étape 5) : le client paie
 * hors plateforme, l'utilisateur pointe lui-même le règlement — traçabilité
 * via saisiParId, jamais un paiement automatique anonyme.
 */
export async function marquerFacturePayee(factureId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") return;

    const datePaiement = new Date();
    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId,
        montant: laFacture.montantTTC,
        moyenPaiement: "manuel",
        saisiParId: utilisateurConnecte.utilisateurId,
        datePaiement,
      })
      .returning({ id: paiement.id });

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, factureId));

    // Palier 4, section 4 — même principe que l'écriture de facturation :
    // générée automatiquement, jamais ressaisie.
    await genererEcrituresPaiement(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureId,
      paiementId: nouveauPaiement.id,
      numeroFacture: laFacture.numero,
      montant: laFacture.montantTTC,
      moyenPaiement: "manuel",
      datePaiement,
    });
  });

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  // Le tableau de bord agrège le CA du mois à partir des paiements — sans
  // cette ligne, il restait sur sa version en cache (Router Cache Next.js)
  // et affichait 0 FCFA après un paiement pourtant bien enregistré. Bug
  // réel trouvé par un test E2E, pas anticipé en écrivant le code.
  revalidatePath("/app");
}

/**
 * Réservé à Manager/Administrateur (docs/palier-1-*, section 7) — un Employé
 * peut créer une facture mais ne l'annule pas seul. Jamais de suppression
 * (règle Palier 0) : l'AvoirFacture garde la trace, le numéro n'est jamais
 * réutilisé.
 */
export async function annulerFacture(factureId: string, motif: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    if (!laFacture || laFacture.statut === "ANNULEE") return;

    await tx.insert(avoirFacture).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureId,
      motif: motif || "Non renseigné",
    });

    await tx.update(facture).set({ statut: "ANNULEE" }).where(eq(facture.id, factureId));
  });

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app"); // affecte les factures en retard affichées au tableau de bord
}

/**
 * Forfait Pro et au-dessus (disponible("PAIEMENTS_EN_LIGNE")) : génère un
 * lien de paiement CamPay (Mobile Money) — non branché tant que
 * CAMPAY_TOKEN (ou CAMPAY_USERNAME/CAMPAY_PASSWORD) ne sont pas configurées (même
 * traitement que Migadu/Resend/R2 : le contrôle d'accès est réel,
 * l'intégration externe est différée). Rappel CLAUDE.md : le paiement Mobile Money est
 * custodial avec délai de reversement — ne jamais présenter ce lien comme un
 * encaissement "instantané" ou "direct".
 *
 * Une ligne tentativePaiementFacture est créée AVANT l'appel à CamPay —
 * son id sert de transaction_id (jamais l'id de la Facture, transmis à un
 * service externe partagé entre entreprises clientes) et sert d'ancrage
 * retrouvable par le webhook de notification (route publique, sans
 * session, voir src/app/api/paiements/campay/notify/route.ts).
 */
export async function genererLienPaiement(factureId: string): Promise<{ url?: string; erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    return creerLienPaiementFacture(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureId,
      returnUrl: `${urlBase()}/app/facturation/factures/${factureId}`,
    });
  });
}

export type EtatEnvoiFacture = { erreur?: string; envoye?: boolean } | null;

/**
 * Même mécanique que envoyerDevis() (voir src/lib/actions/devis.ts) : envoi
 * réel par email avec le PDF en pièce jointe. Contrairement au devis,
 * statutFacture n'a pas d'état "ENVOYE" (docs/palier-1-*, section 5) — une
 * facture existe dans un état de règlement (EMISE/PAYEE/EN_RETARD/ANNULEE)
 * indépendant du fait qu'elle ait été transmise ou non ; cette action ne
 * touche donc pas le statut, elle se contente d'envoyer.
 */
export async function envoyerFacture(factureId: string, _etat: EtatEnvoiFacture, _formData: FormData): Promise<EtatEnvoiFacture> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit d'envoyer cette facture.") };
  }

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await recupererFacturePourPDF(tx, utilisateurConnecte, factureId);
    if (!donnees) return { erreur: t("Facture introuvable.") };
    if (!donnees.client?.email) {
      return { erreur: t("Ce client n'a pas d'adresse email renseignée (voir sa fiche CRM).") };
    }

    const jetonClient = await obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { factureId });

    const [modele, buffer] = await Promise.all([
      recupererModele(tx, utilisateurConnecte.entrepriseId, "ENVOI_FACTURE"),
      rendreDocumentCommercialPDF({
        typeDocument: "FACTURE",
        numero: donnees.facture.numero,
        dateEmission: donnees.facture.dateEmission,
        dateEcheanceOuValidite: donnees.facture.dateEcheance,
        labelDateSecondaire: "Date d'échéance",
        entreprise: donnees.entreprise,
        client: donnees.client,
        lignes: donnees.lignes,
        montantHT: donnees.facture.montantHT,
        montantTVA: donnees.facture.montantTVA,
        montantTTC: donnees.facture.montantTTC,
      }),
    ]);

    const variables = {
      client: donnees.client.nom,
      numero: donnees.facture.numero,
      montant: formaterFCFA(donnees.facture.montantTTC),
      entreprise: donnees.entreprise.nom,
    };

    const { envoye, erreur } = await envoyerEmail({
      to: donnees.client.email,
      subject: interpoler(modele.objet, variables),
      html: corpsVersHtml(interpoler(modele.corps, variables)) + `<p><a href="${urlPubliqueFacture(jetonClient)}">Consulter, accepter et régler cette facture en ligne</a></p>`,
      attachments: [{ filename: `${donnees.facture.numero}.pdf`, content: buffer }],
    });

    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'email.") };
    return { envoye: true };
  });
}
