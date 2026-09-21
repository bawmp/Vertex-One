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

/**
 * Comparaison volontairement générique, sans nommer de concurrent précis
 * (décision explicite de l'utilisateur, 2026-09-14 : parler "des solutions
 * qui offrent le même service" plutôt que de citer une marque) — la colonne
 * de droite représente les grandes suites de gestion internationales
 * généralistes (le type de logiciel qu'on trouve en cherchant "CRM" ou
 * "logiciel de gestion" à l'échelle mondiale), jamais un nom précis.
 */
export const COMPARATIF = {
  libelleConcurrent: "Suites de gestion internationales généralistes",
  criteres: [
    { critere: "Paiement", vertexOne: "Mobile Money natif (Orange Money, MTN MoMo), facturé en FCFA", generaliste: "Carte bancaire internationale, facturé en devise étrangère" },
    { critere: "Mise en route", vertexOne: "Essai immédiat, aucun coût d'implémentation", generaliste: "Configuration en libre-service, ou implémentation confiée à un intégrateur (40 à 60 % du coût total selon la solution)" },
    { critere: "Modules inclus", vertexOne: "Un seul prix, tous les modules inclus", generaliste: "Chaque application ou module vendu séparément, ou par palier" },
    { critere: "Langue & conformité locale", vertexOne: "Français, SYSCOHADA, prêt pour la facturation électronique 2026", generaliste: "Interface multilingue générique, rarement pensée pour le Cameroun" },
    { critere: "Support", vertexOne: "Support humain local", generaliste: "Support centralisé, souvent en décalage horaire" },
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
    reponse: "Oui, sans limite de nombre. Vous attribuez un rôle à chaque employé ou collaborateur invité, et vous choisissez les modules auxquels chacun a accès — par exemple un prestataire qui ne voit que les projets et les documents.",
  },
  {
    question: "Mes clients peuvent-ils accepter un devis, payer et signer en ligne ?",
    reponse: "Oui, sans créer de compte. Ils reçoivent un lien : ils consultent le devis ou la facture, l'acceptent ou la refusent, puis règlent en Mobile Money tout de suite ou plus tard. Vos contrats se signent aussi en ligne, avec un code de vérification envoyé par email ; la copie signée, horodatée, est rangée dans le dossier du client et vous est envoyée.",
  },
  {
    question: "Que se passe-t-il si je ne renouvelle pas à temps ?",
    reponse: `Vous êtes prévenu avant l'échéance, puis un délai de grâce de ${DELAI_GRACE_HEURES} heures s'applique après la date de renouvellement avant toute suspension de l'accès.`,
  },
  {
    question: "Je possède plusieurs entreprises — puis-je toutes les gérer avec Vertex One ?",
    reponse: "Oui. Reliez vos entreprises en un groupe (Paramètres → Entreprise) pour voir toutes vos filiales d'un coup d'œil. Chacune garde sa propre connexion, ses propres données et son propre abonnement à part entière (voir Tarifs) — le groupe n'est qu'une vue d'ensemble, aucune donnée ni facturation n'est jamais partagée entre elles.",
  },
];

export const FAQ_TARIFS = [
  {
    question: "Le prix change-t-il selon le nombre de modules utilisés ?",
    reponse: "Non. Un seul prix, tous les modules inclus dès le premier jour — One CRM, One Books, One People, One Projects, One Docs, One Bookings, One Recruit, One Desk et plus. Aucun module n'est verrouillé derrière un forfait supérieur.",
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
  {
    question: "J'ai plusieurs entreprises (filiales) — le prix est-il dégressif ?",
    reponse: `Non. Vous pouvez relier vos entreprises en groupe pour les voir d'un coup d'œil, mais chacune reste un abonnement Vertex One à part entière, à ${PRIX_ABONNEMENT_MENSUEL_FCFA.toLocaleString("fr-FR")} FCFA/mois, avec son propre essai et sa propre échéance. Aucune remise groupée, aucune facture unique pour l'instant.`,
  },
];
