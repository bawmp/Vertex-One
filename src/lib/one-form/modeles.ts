/**
 * Modèles de formulaires prêts à l'emploi (One Form). Données pures : un modèle est
 * copié dans l'entreprise (formulaire + champs) à la création, puis se modifie comme
 * n'importe quel formulaire. Le serveur relit toujours le modèle par son identifiant —
 * jamais de contenu de modèle envoyé par le client.
 */

export type TypeChampModele = "TEXTE_COURT" | "TEXTE_LONG" | "EMAIL" | "TELEPHONE" | "NOMBRE" | "DATE" | "CHOIX_UNIQUE" | "CHOIX_MULTIPLE" | "LISTE_DEROULANTE" | "FICHIER";

export type ChampModele = {
  type: TypeChampModele;
  libelle: string;
  obligatoire?: boolean;
  /** Choix proposés (une entrée par option) ; pour FICHIER : catégories acceptées (IMAGE, PDF, DOCUMENT). */
  options?: string[];
};

export type ModeleFormulaire = {
  id: string;
  nom: string;
  resume: string;
  titre: string;
  description: string;
  messageConfirmation: string;
  /** Crée un Lead CRM à chaque réponse (nécessite un champ Téléphone rempli). */
  creerLeadALaReponse: boolean;
  champs: ChampModele[];
};

const VILLES = ["Yaoundé", "Douala", "Autre ville"];

export const MODELES_FORMULAIRES: ModeleFormulaire[] = [
  {
    id: "contact",
    nom: "Contact",
    resume: "Un formulaire simple pour être joint par vos visiteurs.",
    titre: "Contactez-nous",
    description: "Une question, un projet ? Écrivez-nous, nous vous répondons rapidement.",
    messageConfirmation: "Merci pour votre message. Notre équipe vous répondra très prochainement.",
    creerLeadALaReponse: true,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone (WhatsApp de préférence)", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "LISTE_DEROULANTE", libelle: "Sujet de votre demande", options: ["Information sur vos services", "Demande de devis", "Suivi d'un dossier", "Autre"] },
      { type: "TEXTE_LONG", libelle: "Votre message", obligatoire: true },
    ],
  },
  {
    id: "demande-devis",
    nom: "Demande de devis",
    resume: "Recueillez le besoin d'un prospect avant de lui répondre.",
    titre: "Demande de devis gratuit",
    description: "Décrivez votre besoin en quelques lignes : nous vous envoyons un devis détaillé sous 48 heures.",
    messageConfirmation: "Merci, votre demande de devis a bien été reçue. Nous revenons vers vous sous 48 heures.",
    creerLeadALaReponse: true,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TEXTE_COURT", libelle: "Entreprise (si applicable)" },
      { type: "TELEPHONE", libelle: "Téléphone (WhatsApp de préférence)", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "CHOIX_MULTIPLE", libelle: "Services souhaités", options: ["Service 1", "Service 2", "Service 3", "Autre"], obligatoire: true },
      { type: "TEXTE_LONG", libelle: "Décrivez votre besoin", obligatoire: true },
      { type: "LISTE_DEROULANTE", libelle: "Budget estimatif", options: ["Moins de 100 000 FCFA", "100 000 à 500 000 FCFA", "500 000 à 1 000 000 FCFA", "Plus de 1 000 000 FCFA", "Je ne sais pas encore"] },
      { type: "DATE", libelle: "Date souhaitée de démarrage" },
    ],
  },
  {
    id: "accompagnement-visa",
    nom: "Demande d'accompagnement visa",
    resume: "Premier contact d'un client qui souhaite être accompagné pour un visa.",
    titre: "Demande d'accompagnement pour un visa",
    description: "Renseignez votre projet de voyage : un conseiller vous contacte pour préparer votre dossier.",
    messageConfirmation: "Merci, votre demande a bien été enregistrée. Un conseiller vous contactera très bientôt.",
    creerLeadALaReponse: true,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet (comme sur le passeport)", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone (WhatsApp de préférence)", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "TEXTE_COURT", libelle: "Pays de destination", obligatoire: true },
      { type: "LISTE_DEROULANTE", libelle: "Motif du voyage", options: ["Tourisme", "Affaires", "Études", "Visite familiale", "Travail", "Autre"], obligatoire: true },
      { type: "DATE", libelle: "Date de départ envisagée" },
      { type: "CHOIX_UNIQUE", libelle: "Avez-vous un passeport valide ?", options: ["Oui", "Non", "En cours de renouvellement"], obligatoire: true },
      { type: "CHOIX_UNIQUE", libelle: "Avez-vous déjà fait une demande de visa refusée ?", options: ["Non", "Oui"] },
      { type: "FICHIER", libelle: "Copie de votre passeport (page d'identité)", options: ["IMAGE", "PDF"] },
      { type: "TEXTE_LONG", libelle: "Informations complémentaires" },
    ],
  },
  {
    id: "candidature-spontanee",
    nom: "Candidature spontanée",
    resume: "Recevez les CV de personnes intéressées par un poste chez vous.",
    titre: "Rejoignez notre équipe",
    description: "Envoyez-nous votre candidature : nous étudions chaque profil avec attention.",
    messageConfirmation: "Merci pour votre candidature. Nous l'étudions et reviendrons vers vous si votre profil correspond à un besoin.",
    creerLeadALaReponse: false,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email", obligatoire: true },
      { type: "TEXTE_COURT", libelle: "Poste souhaité", obligatoire: true },
      { type: "LISTE_DEROULANTE", libelle: "Ville", options: VILLES },
      { type: "LISTE_DEROULANTE", libelle: "Niveau d'études", options: ["Baccalauréat", "Bac+2", "Bac+3 / Licence", "Bac+5 / Master", "Autre"] },
      { type: "NOMBRE", libelle: "Années d'expérience" },
      { type: "FICHIER", libelle: "Votre CV", obligatoire: true, options: ["PDF", "DOCUMENT"] },
      { type: "TEXTE_LONG", libelle: "Pourquoi souhaitez-vous nous rejoindre ?" },
    ],
  },
  {
    id: "satisfaction-client",
    nom: "Satisfaction client",
    resume: "Mesurez la qualité de votre service après une prestation.",
    titre: "Votre avis nous intéresse",
    description: "Deux minutes pour nous dire comment s'est passée votre expérience.",
    messageConfirmation: "Merci pour votre retour, il nous aide à nous améliorer.",
    creerLeadALaReponse: false,
    champs: [
      { type: "TEXTE_COURT", libelle: "Votre nom (facultatif)" },
      { type: "CHOIX_UNIQUE", libelle: "Note globale", options: ["5 — Excellent", "4 — Très bien", "3 — Correct", "2 — Décevant", "1 — Mauvais"], obligatoire: true },
      { type: "CHOIX_UNIQUE", libelle: "Nous recommanderiez-vous à un proche ?", options: ["Certainement", "Probablement", "Peu probable", "Non"], obligatoire: true },
      { type: "CHOIX_MULTIPLE", libelle: "Ce que vous avez le plus apprécié", options: ["Rapidité", "Qualité du travail", "Accueil et écoute", "Prix", "Professionnalisme"] },
      { type: "TEXTE_LONG", libelle: "Comment pouvons-nous nous améliorer ?" },
      { type: "TELEPHONE", libelle: "Téléphone (si vous acceptez d'être rappelé)" },
    ],
  },
  {
    id: "inscription-evenement",
    nom: "Inscription à un événement",
    resume: "Collectez les inscriptions à une formation, un atelier ou une rencontre.",
    titre: "Inscription à notre événement",
    description: "Réservez votre place : les places sont limitées.",
    messageConfirmation: "Votre inscription est enregistrée. Vous recevrez les détails pratiques avant l'événement.",
    creerLeadALaReponse: true,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone (WhatsApp de préférence)", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "TEXTE_COURT", libelle: "Entreprise ou structure" },
      { type: "NOMBRE", libelle: "Nombre de participants", obligatoire: true },
      { type: "CHOIX_UNIQUE", libelle: "Comment avez-vous connu cet événement ?", options: ["Réseaux sociaux", "Bouche-à-oreille", "Email ou WhatsApp", "Autre"] },
      { type: "TEXTE_LONG", libelle: "Une question ou un besoin particulier ?" },
    ],
  },
  {
    id: "demande-support",
    nom: "Demande d'assistance / réclamation",
    resume: "Recueillez les problèmes et réclamations de vos clients.",
    titre: "Besoin d'aide ?",
    description: "Décrivez votre problème : nous le traitons dans les meilleurs délais.",
    messageConfirmation: "Merci, votre demande a été transmise à notre équipe. Nous vous répondons dès que possible.",
    creerLeadALaReponse: false,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "LISTE_DEROULANTE", libelle: "Nature de la demande", options: ["Question", "Problème sur un service", "Réclamation", "Demande de remboursement", "Autre"], obligatoire: true },
      { type: "LISTE_DEROULANTE", libelle: "Urgence", options: ["Faible", "Normale", "Urgente"] },
      { type: "TEXTE_LONG", libelle: "Décrivez votre demande", obligatoire: true },
      { type: "FICHIER", libelle: "Pièce jointe (capture, photo, document)", options: ["IMAGE", "PDF"] },
    ],
  },
  {
    id: "rendez-vous",
    nom: "Demande de rendez-vous",
    resume: "Laissez vos clients proposer un créneau pour vous rencontrer.",
    titre: "Demander un rendez-vous",
    description: "Indiquez vos disponibilités : nous confirmons le créneau par téléphone.",
    messageConfirmation: "Merci, votre demande de rendez-vous est enregistrée. Nous vous confirmons le créneau par téléphone.",
    creerLeadALaReponse: true,
    champs: [
      { type: "TEXTE_COURT", libelle: "Nom complet", obligatoire: true },
      { type: "TELEPHONE", libelle: "Téléphone (WhatsApp de préférence)", obligatoire: true },
      { type: "EMAIL", libelle: "Adresse email" },
      { type: "TEXTE_COURT", libelle: "Objet du rendez-vous", obligatoire: true },
      { type: "DATE", libelle: "Date souhaitée", obligatoire: true },
      { type: "LISTE_DEROULANTE", libelle: "Moment de la journée", options: ["Matin", "Après-midi", "Peu importe"] },
      { type: "CHOIX_UNIQUE", libelle: "Type de rendez-vous", options: ["Dans vos locaux", "Par téléphone ou WhatsApp", "Par visioconférence"] },
    ],
  },
];

export function trouverModele(id: string): ModeleFormulaire | undefined {
  return MODELES_FORMULAIRES.find((m) => m.id === id);
}
