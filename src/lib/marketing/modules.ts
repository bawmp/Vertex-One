import {
  Handshake,
  Receipt,
  Users,
  Briefcase,
  LifeBuoy,
  CalendarCheck,
  FolderKanban,
  FileSignature,
  Megaphone,
  MessageSquare,
  ClipboardList,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Source unique de contenu pour le site vitrine ("/modules" et
 * "/modules/[slug]") — jamais une page par module écrite à la main. Les
 * regroupements et les puces "capacites" reflètent ce que le produit fait
 * réellement (relu contre le code : src/lib/plans.ts, src/lib/i18n, les
 * pages sous src/app/app/), pas une description marketing générique.
 *
 * Depuis l'abonnement plat unique (2026-09-14, voir src/lib/plans.ts), les
 * modules ci-dessous sont TOUS inclus dans le même prix — aucun n'est
 * vendu séparément, contrairement à Zoho One.
 */
export type ModuleMarketing = {
  slug: string;
  nom: string;
  resume: string;
  icone: LucideIcon;
  /**
   * Fond coloré de la puce d'icône (site vitrine uniquement — jamais utilisé
   * dans l'application, qui garde sa propre palette emerald/amber). Classe
   * Tailwind complète et littérale (jamais construite par concaténation),
   * pour que le scanner JIT de Tailwind la détecte. Une teinte distincte par
   * module, à l'image de la grille d'icônes colorées de Zoho One.
   */
  classeFond: string;
  capacites: string[];
};

export const MODULES_MARKETING: ModuleMarketing[] = [
  {
    slug: "crm",
    nom: "One CRM",
    resume: "Prospects, opportunités et pipeline commercial, du premier contact à la facture.",
    icone: Handshake,
    classeFond: "bg-blue-500",
    capacites: [
      "Suivi des prospects du statut Nouveau à Gagné/Perdu, avec qualification et proposition comme étapes intermédiaires",
      "Chaque opportunité est assignée à une personne précise, avec une visibilité selon la portée (toute l'équipe, son équipe, ou seulement les siennes)",
      "Tâches et réunions rattachées directement à une opportunité",
      "Conversion en un clic d'une opportunité gagnée vers un devis puis une facture — aucune ressaisie",
    ],
  },
  {
    slug: "books",
    nom: "One Books",
    resume: "Facturation, achats et comptabilité SYSCOHADA dans un seul module — du devis au paiement Mobile Money.",
    icone: Receipt,
    classeFond: "bg-amber-500",
    capacites: [
      "Numéro de facture généré uniquement au moment exact de l'émission, jamais avant, par une opération protégée contre les doublons",
      "TVA calculée ligne par ligne à 19,25 %, avec blocage de toute émission tant que le NIU de l'entreprise n'est pas renseigné",
      "Acomptes, bons de commande, factures récurrentes et reçus de vente",
      "Relance automatique des factures impayées, sans intervention manuelle",
      "Paiement en ligne Mobile Money (Orange Money, MTN MoMo) directement depuis la facture, via CinetPay",
      "Le client reçoit un lien : il consulte son devis, l'accepte ou le refuse en indiquant pourquoi — l'acceptation crée automatiquement la facture",
      "Sur sa facture, le client l'accepte ou la conteste (motif obligatoire), puis la règle tout de suite ou plus tard depuis le même lien",
      "Chaque réponse du client est horodatée, avec son adresse IP, et l'équipe est prévenue par email",
      "Achats : fiches fournisseurs et bons de commande d'achat, convertibles directement en facture fournisseur",
      "Suivi des factures fournisseurs en retard, distinct du suivi des impayés clients ; une facture se marque payée ou s'annule en gardant l'historique",
      "Comptabilité : plan comptable conforme au référentiel SYSCOHADA (classes 1 à 8), soldes calculés automatiquement par entreprise",
      "Journaux manuels, rapprochement bancaire par import de relevé, et budgets comparés au réalisé par compte",
      "Verrouillage d'une période comptable une fois clôturée",
      "La comptabilité reste réservée à l'Administrateur — jamais visible d'un simple employé",
    ],
  },
  {
    slug: "rh",
    nom: "One People",
    resume: "Dossiers employés, congés, pointage et suivi d'activité — hors paie.",
    icone: Users,
    classeFond: "bg-purple-500",
    capacites: [
      "Dossier RH créé automatiquement à l'activation d'un compte employé (poste, contrat, date d'embauche)",
      "Salaire jamais rempli automatiquement, visible uniquement par l'Administrateur et l'intéressé",
      "Demandes de congés avec politiques configurables, pointage, suivi d'activité par employé",
      "Sondages internes et tickets RH par catégorie",
      "Hiérarchie de management à plusieurs niveaux — un manager voit toute son équipe étendue, pas seulement ses subordonnés directs",
      "Organisation par département, avec visibilité RH cloisonnée entre départements — un manager ne voit que le sien, sauf permission explicite de l'Administrateur",
    ],
  },
  {
    slug: "recrutement",
    nom: "One Recruit",
    resume: "Postes ouverts, candidatures et conversion directe en compte employé.",
    icone: Briefcase,
    classeFond: "bg-pink-500",
    capacites: [
      "Postes ouverts et candidatures avec CV stocké en toute sécurité",
      "Suivi du candidat de Reçue à Entretien, Offre puis Embauche",
      "Conversion d'une candidature embauchée directement en compte utilisateur, sans ressaisie",
      "Page carrières publique aux couleurs de l'entreprise, avec dépôt de candidature et CV",
      "Offres modifiables à tout moment, désactivables puis réactivables ; une offre qui a déjà reçu des candidatures se désactive au lieu de se supprimer",
      "Candidatures corrigeables, annulables (et rétablissables) ou supprimables avec effacement réel du CV",
    ],
  },
  {
    slug: "assistance-client",
    nom: "One Desk",
    resume: "Tickets clients par catégorie, avec assignation et suivi de résolution.",
    icone: LifeBuoy,
    classeFond: "bg-cyan-500",
    capacites: [
      "Tickets rattachés à un Contact (pas nécessairement un utilisateur du portail)",
      "Catégories avec agent par défaut, assignation manuelle possible",
      "Suivi du statut de Ouvert à Résolu, avec horodatage de la résolution",
    ],
  },
  {
    slug: "reservations",
    nom: "One Bookings",
    resume: "Prise de rendez-vous en ligne, services, disponibilités et intervenants.",
    icone: CalendarCheck,
    classeFond: "bg-rose-500",
    capacites: [
      "Services réservables avec durée, tampon entre rendez-vous et prix en FCFA",
      "Disponibilités hebdomadaires par intervenant, y compris les coupures (ex. pause déjeuner)",
      "Prix et durée figés au moment de la réservation — une modification ultérieure du service ne change rien aux rendez-vous déjà pris",
      "Page de réservation publique, partageable directement avec vos clients",
    ],
  },
  {
    slug: "projets",
    nom: "One Projects",
    resume: "Dossiers clients permanents et projets bornés, avec feuille de temps.",
    icone: FolderKanban,
    classeFond: "bg-indigo-500",
    capacites: [
      "Distinction claire entre un Dossier client (permanent) et un Projet (une mission précise, avec une fin)",
      "Vocabulaire adapté à votre secteur (Chantier pour un artisan, Mission pour un cabinet)",
      "Feuille de temps avec minuteur démarrable/arrêtable directement sur une tâche",
      "Documents et demandes de signature rattachés directement au projet",
    ],
  },
  {
    slug: "documents-signatures",
    nom: "One Docs & Sign",
    resume: "Stockage classé par sensibilité et signature électronique avec preuve.",
    icone: FileSignature,
    classeFond: "bg-violet-500",
    capacites: [
      "Documents classés par catégorie — les pièces d'identité et données de santé restent réservées au responsable du dossier et à l'Administrateur, avec journalisation de chaque consultation",
      "Signature électronique avec empreinte du document au moment de l'envoi",
      "Code de vérification envoyé par email, adresse IP, appareil et consentement capturés dans un certificat d'audit consultable",
      "Envoi d'un contrat au client depuis son dossier : il lit le document, le signe ou le refuse en indiquant pourquoi",
      "À la signature, le contrat signé et son certificat horodaté (date et heure de Yaoundé) sont rangés directement dans le dossier du client et envoyés à l'Administrateur et au signataire",
    ],
  },
  {
    slug: "marketing",
    nom: "One Marketing",
    resume: "Campagnes email, pages d'atterrissage et relances automatiques — WhatsApp bientôt.",
    icone: Megaphone,
    classeFond: "bg-fuchsia-500",
    capacites: [
      "Campagnes par email, ciblées par statut de prospect ou ancienneté d'inactivité — l'envoi par WhatsApp arrivera dans une prochaine mise à jour",
      "Pages d'atterrissage publiques pour capter de nouveaux prospects",
      "Automatisations prêtes à l'emploi — par exemple relancer un prospect resté sans réponse depuis 7 jours",
    ],
  },
  {
    slug: "one-form",
    nom: "One Form",
    resume: "Formulaires personnalisés à publier via un lien public, réponses centralisées.",
    icone: ClipboardList,
    classeFond: "bg-lime-500",
    capacites: [
      "10 types de champs (texte, email, téléphone, nombre, date, choix unique ou multiple, liste déroulante, fichier joint)",
      "8 modèles prêts à l'emploi : contact, demande de devis, accompagnement visa, candidature, satisfaction client, inscription à un événement, assistance et rendez-vous",
      "Formulaire modifiable, désactivable ou supprimable depuis la liste, champ par champ",
      "Lien public partageable, sans compte ni connexion requise pour y répondre",
      "Réponses centralisées et consultables directement dans l'application",
      "Création automatique d'un Lead CRM à chaque réponse, en option",
      "Notification par email à chaque nouvelle réponse, en option",
      "Protection anti-spam intégrée sur le formulaire public",
      "Disponibilité programmable : date d'ouverture, date de fermeture, nombre maximal de réponses",
    ],
  },
  {
    slug: "one-vault",
    nom: "One Vault",
    resume: "Identifiants et notes sensibles chiffrés, privés ou partagés avec l'équipe.",
    icone: KeyRound,
    classeFond: "bg-yellow-500",
    capacites: [
      "Mots de passe et notes chiffrés au repos, jamais stockés en clair",
      "Chaque secret est privé par défaut, visible uniquement par son créateur et l'Administrateur",
      "Partage avec toute l'équipe en un clic, pour les identifiants communs",
      "Générateur de mot de passe intégré",
      "Journal de consultation à chaque révélation d'un mot de passe",
    ],
  },
  {
    slug: "communication-interne",
    nom: "One Chat",
    resume: "Messagerie d'équipe : canaux, messages directs, groupes privés, fils et pièces jointes.",
    icone: MessageSquare,
    classeFond: "bg-sky-500",
    capacites: [
      "Canaux par projet, par équipe ou libres, avec un canal Général créé pour vous",
      "Messages directs et groupes privés, visibles de leurs seuls membres — pas même de l'Administrateur",
      "Pièces jointes (images, PDF, Word, Excel), réactions par emoji et fils de discussion qui n'encombrent pas la conversation",
      "Mentions @nom avec auto-complétion, prévenues par email quand elles restent sans lecture",
      "Recherche dans les messages, limitée aux conversations auxquelles vous avez accès",
      "Présence en ligne, compteur de messages non lus et notifications du navigateur",
      "Fil d'annonces internes façon intranet, avec pièces jointes (images, PDF, Word, Excel)",
      "Isolation stricte entre entreprises clientes",
    ],
  },
];

export function trouverModuleMarketing(slug: string): ModuleMarketing | undefined {
  return MODULES_MARKETING.find((m) => m.slug === slug);
}
