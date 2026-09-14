import {
  Handshake,
  Receipt,
  ShoppingCart,
  Calculator,
  Users,
  Briefcase,
  LifeBuoy,
  CalendarCheck,
  FolderKanban,
  FileSignature,
  Megaphone,
  MessageSquare,
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
 * 12 modules ci-dessous sont TOUS inclus dans le même prix — aucun n'est
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
    nom: "CRM",
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
    slug: "facturation",
    nom: "Facturation",
    resume: "Devis, factures, acomptes et relances — jusqu'au paiement Mobile Money.",
    icone: Receipt,
    classeFond: "bg-amber-500",
    capacites: [
      "Numéro de facture généré uniquement au moment exact de l'émission, jamais avant, par une opération protégée contre les doublons",
      "TVA calculée ligne par ligne à 19,25 %, avec blocage de toute émission tant que le NIU de l'entreprise n'est pas renseigné",
      "Acomptes, bons de commande, factures récurrentes et reçus de vente",
      "Relance automatique des factures impayées, sans intervention manuelle",
      "Paiement en ligne Mobile Money (Orange Money, MTN MoMo) directement depuis la facture, via CinetPay",
    ],
  },
  {
    slug: "achats",
    nom: "Achats & Fournisseurs",
    resume: "Bons de commande, factures fournisseurs et suivi des échéances à payer.",
    icone: ShoppingCart,
    classeFond: "bg-orange-500",
    capacites: [
      "Fiches fournisseurs et bons de commande d'achat, convertibles directement en facture fournisseur",
      "Suivi des factures fournisseurs en retard, distinct du suivi des impayés clients",
      "Marquage d'une facture comme payée, ou son annulation, en gardant l'historique",
    ],
  },
  {
    slug: "comptabilite",
    nom: "Comptabilité",
    resume: "Plan comptable SYSCOHADA, journaux, rapprochement bancaire et budgets.",
    icone: Calculator,
    classeFond: "bg-teal-500",
    capacites: [
      "Plan comptable conforme au référentiel SYSCOHADA (classes 1 à 8), soldes calculés automatiquement par entreprise",
      "Journaux manuels et rapprochement bancaire par import de relevé",
      "Budgets comparés au réalisé, par compte",
      "Verrouillage d'une période comptable une fois clôturée",
      "Réservé à l'Administrateur — jamais visible d'un simple employé",
    ],
  },
  {
    slug: "rh",
    nom: "Ressources Humaines",
    resume: "Dossiers employés, congés, pointage et suivi d'activité — hors paie.",
    icone: Users,
    classeFond: "bg-purple-500",
    capacites: [
      "Dossier RH créé automatiquement à l'activation d'un compte employé (poste, contrat, date d'embauche)",
      "Salaire jamais rempli automatiquement, visible uniquement par l'Administrateur et l'intéressé",
      "Demandes de congés avec politiques configurables, pointage, suivi d'activité par employé",
      "Sondages internes et tickets RH par catégorie",
    ],
  },
  {
    slug: "recrutement",
    nom: "Recrutement",
    resume: "Postes ouverts, candidatures et conversion directe en compte employé.",
    icone: Briefcase,
    classeFond: "bg-pink-500",
    capacites: [
      "Postes ouverts et candidatures avec CV stocké en toute sécurité",
      "Suivi du candidat de Reçue à Entretien, Offre puis Embauche",
      "Conversion d'une candidature embauchée directement en compte utilisateur, sans ressaisie",
    ],
  },
  {
    slug: "assistance-client",
    nom: "Assistance client",
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
    nom: "Réservations",
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
    nom: "Projets",
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
    nom: "Documents & Signatures",
    resume: "Stockage classé par sensibilité et signature électronique avec preuve.",
    icone: FileSignature,
    classeFond: "bg-violet-500",
    capacites: [
      "Documents classés par catégorie — les pièces d'identité et données de santé restent réservées au responsable du dossier et à l'Administrateur, avec journalisation de chaque consultation",
      "Signature électronique avec empreinte du document au moment de l'envoi",
      "Code de vérification envoyé par WhatsApp ou SMS, adresse IP et consentement capturés dans un certificat d'audit consultable",
      "Option de signature certifiée, en plus de la signature simple",
    ],
  },
  {
    slug: "marketing",
    nom: "Marketing",
    resume: "Campagnes email et WhatsApp, pages d'atterrissage et relances automatiques.",
    icone: Megaphone,
    classeFond: "bg-fuchsia-500",
    capacites: [
      "Campagnes par email ou WhatsApp, ciblées par statut de prospect ou ancienneté d'inactivité",
      "Pages d'atterrissage publiques pour capter de nouveaux prospects",
      "Automatisations prêtes à l'emploi — par exemple relancer un prospect resté sans réponse depuis 7 jours",
    ],
  },
  {
    slug: "communication-interne",
    nom: "Communication interne",
    resume: "Messagerie par canal et fil d'annonces, pour toute l'équipe.",
    icone: MessageSquare,
    classeFond: "bg-sky-500",
    capacites: [
      "Canaux de discussion rattachés à un projet, une équipe, ou libres",
      "Fil d'annonces internes façon intranet",
      "Isolation stricte entre entreprises clientes, même chez le prestataire technique",
    ],
  },
];

export function trouverModuleMarketing(slug: string): ModuleMarketing | undefined {
  return MODULES_MARKETING.find((m) => m.slug === slug);
}
