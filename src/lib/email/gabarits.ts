import { formaterFCFA } from "@/lib/facturation/calcul";
import type { EvenementAbonnement } from "@/lib/abonnement/etat";

/**
 * Gabarit minimal — pas de mise en page HTML élaborée tant qu'un client
 * réel n'en a pas exprimé le besoin (voir esprit général du projet : ne
 * pas construire au-delà de ce qui est demandé).
 */
export function gabaritRelanceFacture({
  nomClient,
  numeroFacture,
  montantTTC,
  dateEcheance,
  nomEntreprise,
}: {
  nomClient: string;
  numeroFacture: string;
  montantTTC: number;
  dateEcheance: Date;
  nomEntreprise: string;
}): { subject: string; html: string } {
  const dateFormatee = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateEcheance);

  return {
    subject: `Relance — facture ${numeroFacture} en attente de paiement`,
    html: `
      <p>Bonjour ${nomClient},</p>
      <p>
        La facture <strong>${numeroFacture}</strong> d'un montant de <strong>${formaterFCFA(montantTTC)}</strong>,
        dont l'échéance était fixée au ${dateFormatee}, n'a pas encore été réglée.
      </p>
      <p>Merci de bien vouloir procéder au règlement dans les meilleurs délais.</p>
      <p>Cordialement,<br>${nomEntreprise}</p>
    `.trim(),
  };
}

const TEXTES_EVENEMENT_ABONNEMENT: Record<EvenementAbonnement, { objet: string; corps: (dateFormatee: string) => string }> = {
  ESSAI_J3: {
    objet: "Votre essai gratuit se termine bientôt",
    corps: (dateFormatee) => `<p>Votre période d'essai gratuite de Vertex One se termine le <strong>${dateFormatee}</strong>.</p><p>Pensez à régler votre abonnement pour continuer à utiliser l'application sans interruption.</p>`,
  },
  ESSAI_TERMINE: {
    objet: "Votre essai gratuit est terminé — activez votre abonnement",
    corps: () => `<p>Votre période d'essai gratuite de Vertex One est terminée.</p><p>Réglez votre abonnement mensuel dès maintenant pour continuer à utiliser l'application — vous disposez encore de 48h avant toute interruption d'accès.</p>`,
  },
  ECHEANCE_J3: {
    objet: "Votre abonnement Vertex One arrive à échéance",
    corps: (dateFormatee) => `<p>Votre abonnement Vertex One arrive à échéance le <strong>${dateFormatee}</strong>.</p><p>Pensez à le renouveler pour continuer à utiliser l'application sans interruption.</p>`,
  },
  ECHEANCE_DEPASSEE: {
    objet: "Paiement en retard — votre accès à Vertex One va bientôt être suspendu",
    corps: () => `<p>L'échéance de votre abonnement Vertex One est dépassée.</p><p>Réglez votre abonnement dans les 48h suivant l'échéance pour éviter toute interruption d'accès.</p>`,
  },
  SUSPENDU: {
    objet: "Votre accès à Vertex One a été suspendu",
    corps: () => `<p>Votre abonnement Vertex One n'a pas été renouvelé dans le délai imparti — l'accès à l'application est suspendu.</p><p>Réglez votre abonnement pour réactiver immédiatement votre accès.</p>`,
  },
};

/**
 * Message de Vertex One vers le tenant (jamais personnalisable côté tenant,
 * contrairement aux modèles ENVOI_DEVIS/ENVOI_FACTURE — voir
 * src/lib/email/modeles.ts, volontairement un mécanisme séparé) — une seule
 * fonction plutôt que cinq quasi-doublons, ce sont des variations du même
 * message d'état d'abonnement.
 */
export function gabaritAbonnement({
  evenement,
  nomEntreprise,
  dateEcheance,
  lienPaiement,
}: {
  evenement: EvenementAbonnement;
  nomEntreprise: string;
  dateEcheance: Date;
  lienPaiement: string;
}): { subject: string; html: string } {
  const dateFormatee = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(dateEcheance);
  const { objet, corps } = TEXTES_EVENEMENT_ABONNEMENT[evenement];

  return {
    subject: objet,
    html: `
      <p>Bonjour,</p>
      ${corps(dateFormatee)}
      <p><a href="${lienPaiement}">Régler mon abonnement</a></p>
      <p>Cordialement,<br>L'équipe Vertex One</p>
      <p style="color:#78716c;font-size:12px;">Entreprise concernée : ${nomEntreprise}</p>
    `.trim(),
  };
}
