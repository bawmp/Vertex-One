import "server-only";
import { after } from "next/server";
import { avecEntreprise } from "@/db/client";
import { gabaritPaiementFactureRecu, gabaritRecuPaiementClient } from "@/lib/email/gabarits";
import { enteteLogoEmail } from "@/lib/email/logo";
import { envoyerEmail } from "@/lib/email/client";
import { journaliserEmailEnvoye, resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { obtenirOuCreerLien, urlPubliqueFacture } from "@/lib/client-documents/liens";
import { recupererFacturePourClient } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import { alerterParEmail, echapper } from "@/lib/notifications/equipe";

/**
 * Ce qui part après un paiement de facture confirmé : l'Administrateur est prévenu, et le client reçoit un reçu avec la facture à jour
 * en PDF, au nom de l'entreprise. Partagé par la confirmation d'un paiement Mobile Money fait dans Vertex One
 * (src/lib/paiement/confirmation.ts) et par les factures créées pour un paiement fait sur un site connecté (src/lib/api-externe/facture.ts).
 */
function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/** "Orange_Cameroon" → "Mobile Money (Orange)" — reçu uniquement, jamais réutilisé pour une décision applicative. */
export function libelleMoyenPaiement(operateur: string | undefined): string {
  if (!operateur) return "Mobile Money";
  if (/orange/i.test(operateur)) return "Mobile Money (Orange)";
  if (/mtn/i.test(operateur)) return "Mobile Money (MTN)";
  return "Mobile Money";
}

export type NotificationPaiementFacture = { entrepriseId: string; adresses: string[]; nomClient: string; emailClient: string | null; numeroFacture: string; factureId: string; contactId: string | null; montant: number; moyen: string; resteAPayer: number };

/** Envoi après la réponse quand on est dans une requête (le client ne l'attend jamais), directement sinon (worker, test). Jamais d'erreur remontée. */
export function notifierPaiementFacture(n: NotificationPaiementFacture): void {
  const envoyer = async () => {
    try {
      const { subject, html } = gabaritPaiementFactureRecu({
        nomClient: echapper(n.nomClient),
        numeroFacture: echapper(n.numeroFacture),
        montant: n.montant,
        moyen: n.moyen,
        resteAPayer: n.resteAPayer,
        lien: `${urlBase()}/app/facturation/factures/${n.factureId}`,
        clientSansEmail: !n.emailClient,
      });
      await alerterParEmail(n.adresses, subject, html);
    } catch (erreur) {
      console.error("[paiement] échec de la notification de paiement de facture :", erreur instanceof Error ? erreur.message : erreur);
    }
    try {
      await envoyerRecuAuClient(n);
    } catch (erreur) {
      console.error("[paiement] échec de l'envoi du reçu au client :", erreur instanceof Error ? erreur.message : erreur);
    }
  };
  try {
    after(envoyer);
  } catch {
    void envoyer();
  }
}

/**
 * Le client reçoit, après CHAQUE paiement (totalité ou tranche), un email au nom de l'entreprise (logo en tête) avec la facture à jour
 * en PDF (« Déjà réglé », « Reste à payer »). Sans adresse email dans sa fiche, rien ne part (l'Administrateur en est informé dans sa
 * propre notification). Les données sont relues APRÈS la transaction de confirmation : le PDF montre donc bien ce paiement.
 */
async function envoyerRecuAuClient(n: NotificationPaiementFacture): Promise<void> {
  if (!n.emailClient) return;

  const donnees = await avecEntreprise(n.entrepriseId, async (tx) => {
    const d = await recupererFacturePourClient(tx, n.entrepriseId, n.factureId);
    if (!d) return null;
    return { d, jeton: await obtenirOuCreerLien(tx, n.entrepriseId, { factureId: n.factureId }) };
  });
  if (!donnees) return;
  const { d, jeton } = donnees;

  const pdf = await rendreDocumentCommercialPDF({
    typeDocument: "FACTURE",
    numero: d.facture.numero,
    dateEmission: d.facture.dateEmission,
    dateEcheanceOuValidite: d.facture.dateEcheance,
    labelDateSecondaire: "Date d'échéance",
    entreprise: d.entreprise,
    client: d.client,
    lignes: d.lignes,
    montantHT: d.facture.montantHT,
    montantTVA: d.facture.montantTVA,
    montantTTC: d.facture.montantTTC,
    montantRegle: d.paye, acomptesDeduits: d.acomptesDeduits,
  });

  const { subject, html } = gabaritRecuPaiementClient({
    nomClient: echapper(n.nomClient),
    nomEntreprise: echapper(d.entreprise.nom),
    numeroFacture: echapper(n.numeroFacture),
    montant: n.montant,
    moyen: n.moyen,
    resteAPayer: d.solde,
    lien: urlPubliqueFacture(jeton),
  });
  const corps = (await enteteLogoEmail(n.entrepriseId)) + html;
  const piecesJointes = [{ filename: `${d.facture.numero}.pdf`, content: pdf }];

  const { envoye, erreur } = await envoyerEmail({ to: n.emailClient, subject, html: corps, attachments: piecesJointes, nomExpediteur: d.entreprise.nom });
  if (!envoye) {
    console.error(`[paiement] reçu non envoyé au client de la facture ${n.numeroFacture} :`, erreur);
    return;
  }
  if (n.contactId) {
    await avecEntreprise(n.entrepriseId, (tx) =>
      journaliserEmailEnvoye(tx, {
        entrepriseId: n.entrepriseId,
        contactId: n.contactId!,
        auteurId: null,
        sujet: subject,
        souche: { destinataire: n.emailClient!, html: corps, piecesJointes: resumePiecesJointes(piecesJointes), type: "FACTURE" },
      })
    );
  }
}
