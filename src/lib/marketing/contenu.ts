/**
 * Contenu partagé entre plusieurs pages du site vitrine (accueil + tarifs),
 * pour ne pas dupliquer la même FAQ ou le même tableau comparatif à deux
 * endroits qui finiraient par diverger.
 */

// Dupliqué depuis PRIX_ABONNEMENT_MENSUEL (src/lib/actions/abonnement.ts) —
// ce fichier porte "use server" et n'exporte pas sa constante, impossible à
// importer ici. Garder synchronisé avec les deux endroits si le prix change
// (voir aussi docs/mise-en-production-checklist.md et
// docs/crm-roadmap-post-commercialisation.md, section 37).
export const PRIX_ABONNEMENT_MENSUEL_FCFA = 50_000;
export const DUREE_ESSAI_JOURS = 14;
export const DELAI_GRACE_HEURES = 48;

export const COMPARATIF = {
  criteres: [
    { critere: "Paiement", vertexOne: "Mobile Money natif (Orange Money, MTN MoMo), facturé en FCFA", zohoOne: "Carte bancaire internationale, facturé en dollars", odoo: "Dépend de l'intégration choisie, rarement Mobile Money natif" },
    { critere: "Mise en route", vertexOne: "Essai immédiat, aucun coût d'implémentation", zohoOne: "Configuration en libre-service", odoo: "Implémentation souvent confiée à un intégrateur (40 à 60 % du coût total)" },
    { critere: "Modules inclus", vertexOne: "Un seul prix, tous les modules inclus", zohoOne: "Chaque application vendue séparément ou par palier", odoo: "Chaque module a un coût de licence propre" },
    { critere: "Langue & conformité locale", vertexOne: "Français, SYSCOHADA, prêt pour la facturation électronique 2026", zohoOne: "Interface multilingue générique, non pensée pour le Cameroun", odoo: "Dépend entièrement du paramétrage" },
    { critere: "Support", vertexOne: "Support humain local", zohoOne: "Support centralisé, décalage horaire", odoo: "Dépend de l'intégrateur choisi" },
  ],
};

export const FAQ_ACCUEIL = [
  {
    question: "Est-ce que je peux essayer avant de payer ?",
    reponse: `Oui — chaque nouvelle entreprise bénéficie de ${DUREE_ESSAI_JOURS} jours d'essai gratuit, avec un accès complet à tous les modules, sans carte bancaire requise pour commencer.`,
  },
  {
    question: "Le paiement Mobile Money est-il instantané ?",
    reponse: "Non — CinetPay, notre partenaire de paiement, fonctionne en mode custodial avec un délai de reversement (8 jours par défaut). Vertex One ne présente jamais ce paiement comme instantané ou direct.",
  },
  {
    question: "Puis-je inviter mon équipe ?",
    reponse: "Oui, sans limite de nombre. Une fois votre abonnement actif, vous attribuez librement un rôle à chaque employé ou collaborateur invité.",
  },
  {
    question: "Que se passe-t-il si je ne renouvelle pas à temps ?",
    reponse: `Vous êtes prévenu avant l'échéance, puis un délai de grâce de ${DELAI_GRACE_HEURES} heures s'applique après la date de renouvellement avant toute suspension de l'accès.`,
  },
];

export const FAQ_TARIFS = [
  {
    question: "Le prix change-t-il selon le nombre de modules utilisés ?",
    reponse: "Non. Un seul prix, tous les modules inclus dès le premier jour — CRM, Facturation, RH, Projets, Documents, Réservations, Recrutement, Assistance client et plus. Aucun module n'est verrouillé derrière un forfait supérieur.",
  },
  {
    question: "Le prix change-t-il selon le nombre d'employés ?",
    reponse: "Non. Vous invitez autant d'employés et de collaborateurs que nécessaire, sans coût supplémentaire par utilisateur.",
  },
  {
    question: "Comment se passe le paiement ?",
    reponse: "Par Mobile Money (Orange Money, MTN MoMo) via CinetPay, un partenaire de paiement local. Le règlement est custodial, avec un délai de reversement — jamais présenté comme instantané.",
  },
  {
    question: "Que se passe-t-il à la fin de l'essai gratuit ?",
    reponse: `Vous êtes notifié avant l'échéance de votre essai de ${DUREE_ESSAI_JOURS} jours. Sans renouvellement, un délai de grâce de ${DELAI_GRACE_HEURES} heures s'applique avant la suspension de l'accès — vos données restent intactes.`,
  },
];
