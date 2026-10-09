import { formaterFCFA } from "@/lib/facturation/calcul";
import type { EvenementAbonnement } from "@/lib/abonnement/etat";

/**
 * Gabarit minimal — pas de mise en page HTML élaborée tant qu'un client
 * réel n'en a pas exprimé le besoin (voir esprit général du projet : ne
 * pas construire au-delà de ce qui est demandé).
 */
/**
 * Lien à durée limitée (1h, géré par Better-Auth) pour redéfinir son mot de passe — déclenché soit par
 * l'intéressé lui-même (/mot-de-passe-oublie), soit par un Administrateur ("Renvoyer un accès", Équipe). Voir
 * sendResetPassword dans src/lib/auth.ts : jamais envoyé à un compte désactivé.
 */
export function gabaritReinitialisationMotDePasse({ nomClient, url }: { nomClient: string; url: string }): { subject: string; html: string } {
  return {
    subject: "Réinitialisation de votre mot de passe Vertex One",
    html: `
      <p>Bonjour ${nomClient},</p>
      <p>Une demande de réinitialisation de mot de passe a été faite pour votre compte Vertex One.</p>
      <p><a href="${url}">Choisir un nouveau mot de passe</a></p>
      <p>Ce lien expire dans une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
    `.trim(),
  };
}

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
 * Notification de RÉSULTAT d'un paiement d'abonnement (2026-09-23) — distincte de gabaritAbonnement ci-dessous
 * (qui couvre les rappels d'échéance/essai, pilotés par calculerEtatAbonnement()) : ici, le déclencheur est une
 * confirmation ou un échec RÉEL constaté auprès d'Aangaraa Pay (voir confirmerTentativeAbonnement(),
 * src/lib/paiement/confirmation.ts), envoyée quel que soit le chemin qui a confirmé le paiement (sondage client ou
 * réconciliation serveur) — un client qui a quitté l'écran de paiement doit être informé sans devoir y revenir.
 */
export function gabaritPaiementAbonnement({
  reussi,
  nomEntreprise,
  lienPaiement,
}: {
  reussi: boolean;
  nomEntreprise: string;
  lienPaiement: string;
}): { subject: string; html: string } {
  if (reussi) {
    return {
      subject: "Paiement reçu — votre abonnement Vertex One est actif",
      html: `
        <p>Bonjour,</p>
        <p>Votre paiement a bien été reçu — l'abonnement Vertex One de <strong>${nomEntreprise}</strong> est actif.</p>
        <p>Cordialement,<br>L'équipe Vertex One</p>
      `.trim(),
    };
  }
  return {
    subject: "Paiement non abouti — abonnement Vertex One",
    html: `
      <p>Bonjour,</p>
      <p>Le paiement Mobile Money tenté pour l'abonnement Vertex One de <strong>${nomEntreprise}</strong> n'a pas abouti.</p>
      <p><a href="${lienPaiement}">Réessayer le paiement</a></p>
      <p>Cordialement,<br>L'équipe Vertex One</p>
    `.trim(),
  };
}

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

/**
 * Prévient un Administrateur qu'une suppression de document a été demandée (2026-10-08). Tout texte saisi par un
 * utilisateur (nom, motif, nom du document) est échappé. Un document sensible n'est jamais nommé dans l'email
 * (`documentNom` vaut alors null) : le nom d'un fichier privé ne doit pas voyager par messagerie.
 */
export function gabaritDemandeSuppressionDocument({
  demandeur,
  documentNom,
  motif,
  lien,
}: {
  demandeur: string;
  documentNom: string | null;
  motif: string | null;
  lien: string;
}): { subject: string; html: string } {
  const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const cible = documentNom ? `le document <strong>${echapper(documentNom)}</strong>` : "une pièce privée";
  return {
    subject: "Demande de suppression d'un document à valider",
    html: `
      <p>Bonjour,</p>
      <p><strong>${echapper(demandeur)}</strong> demande la suppression de ${cible}.</p>
      ${motif ? `<p>Motif indiqué : « ${echapper(motif)} »</p>` : ""}
      <p>Rien n'est supprimé tant que vous n'avez pas validé.</p>
      <p><a href="${lien}">Examiner la demande</a></p>
      <p>Cordialement,<br>L'équipe Vertex One</p>
    `.trim(),
  };
}

/**
 * Alerte à l'Administrateur : un nouveau lead est arrivé d'un site externe (API). Tout texte reçu de l'extérieur (nom,
 * message, source) est échappé : il vient d'un visiteur anonyme.
 */
export function gabaritNouveauLeadExterne({ nom, source, message, lien }: { nom: string; source: string; message: string | null; lien: string }): { subject: string; html: string } {
  const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return {
    subject: `Nouvelle demande — ${nom}`,
    html: `
      <p>Bonjour,</p>
      <p>Une nouvelle demande vient d'arriver depuis <strong>${echapper(source)}</strong> : <strong>${echapper(nom)}</strong>.</p>
      ${message ? `<p>Message : « ${echapper(message)} »</p>` : ""}
      <p><a href="${lien}">Ouvrir le lead dans le CRM</a></p>
      <p>Cordialement,<br>L'équipe Vertex One</p>
    `.trim(),
  };
}
