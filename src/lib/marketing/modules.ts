import { m } from "@/lib/i18n/catalogue";
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
  /** Regroupement fonctionnel affiché sur l'accueil uniquement (/modules garde la liste complète à plat) — voir CATEGORIES_MODULES dans page.tsx pour l'ordre d'affichage. */
  categorie: string;
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
    nom: m("One CRM"),
    resume: m("Prospects, opportunités et pipeline commercial, du premier contact à la facture."),
    categorie: m("Gestion commerciale"),
    icone: Handshake,
    classeFond: "bg-blue-500",
    capacites: [
      m("Suivi des prospects du statut Nouveau à Gagné/Perdu, avec qualification et proposition comme étapes intermédiaires"),
      m("Chaque opportunité est assignée à une personne précise, avec une visibilité selon la portée (toute l'équipe, son équipe, ou seulement les siennes)"),
      m("Tâches et réunions rattachées directement à une opportunité"),
      m("Conversion en un clic d'une opportunité gagnée vers un devis puis une facture — aucune ressaisie"),
      m("Écrire à un client depuis sa fiche : l'email part réellement, au nom de l'entreprise, et reste dans l'historique du contact"),
      m("Suppression d'un lead, d'un contact ou d'un deal réservée à l'Administrateur, avec confirmation"),
      m("Fiche contact modifiable à tout moment (nom, société, fonction, téléphone, email), dans la limite de vos droits"),
      m("Profil « immigration et mobilité internationale » : champs de contact prêts à l'emploi pour suivre les dossiers de visa"),
      m("Import de vos données depuis Asana, Zoho ou un fichier Excel/CSV, avec une simulation avant l'import réel"),
      m("Export de vos données en CSV et transfert d'un espace Vertex One à un autre, sans accès croisé entre les deux"),
      m("Les demandes reçues sur votre site web deviennent automatiquement des prospects, grâce à une clé d'API (Paramètres → Intégrations)"),
    ],
  },
  {
    slug: "books",
    nom: m("One Books"),
    resume: m("Facturation, achats et comptabilité SYSCOHADA dans un seul module — du devis au paiement Mobile Money."),
    categorie: m("Gestion financière"),
    icone: Receipt,
    classeFond: "bg-amber-500",
    capacites: [
      m("Numéro de facture généré uniquement au moment exact de l'émission, jamais avant, par une opération protégée contre les doublons"),
      m("TVA calculée ligne par ligne à 19,25 %, avec blocage de toute émission tant que le NIU de l'entreprise n'est pas renseigné"),
      m("Acomptes, bons de commande, factures récurrentes et reçus de vente"),
      m("Un acompte encaissé se déduit tout seul de la facture du client, avec le reste à payer clairement indiqué"),
      m("Relance automatique des factures impayées, sans intervention manuelle"),
      m("Paiement Mobile Money (Orange Money, MTN MoMo) sans quitter la facture : le client saisit son numéro, valide sur son téléphone et la facture passe à « payée », via Aangaraa Pay"),
      m("Le client reçoit un lien : il consulte son devis, l'accepte ou le refuse en indiquant pourquoi — l'acceptation crée automatiquement la facture"),
      m("Sur sa facture, le client l'accepte ou la conteste (motif obligatoire), puis la règle tout de suite ou plus tard depuis le même lien"),
      m("Un site relié à Vertex One y fait émettre automatiquement la facture de chaque paiement reçu : le client la reçoit à votre nom, avec votre logo, et elle est classée dans votre comptabilité"),
      m("Après chaque paiement, le client reçoit par email, à votre nom et avec votre logo, sa facture à jour en PDF (déjà réglé, reste à payer) ; l'Administrateur est prévenu de chaque paiement reçu"),
      m("Le PDF d'une facture partiellement payée affiche le déjà réglé et le reste à payer ; « Marquer comme payée » ne règle que le solde restant"),
      m("Paiement en plusieurs fois : le client choisit le montant de chaque tranche, jusqu'au solde de sa facture ; vous pouvez désactiver cette option"),
      m("Chaque réponse du client est horodatée, avec son adresse IP, et l'équipe est prévenue par email"),
      m("À la fin de son parcours (facture payée), le client est renvoyé vers son espace de suivi — l'adresse est transmise par votre site avec la demande, ou saisie sur la fiche du contact"),
      m("Supprimer un devis resté en brouillon (jamais envoyé), depuis la liste ou la fiche, avec confirmation"),
      m("L'état du devis dit « Accepté par le client » ou « Refusé par le client » dans les listes et sur la fiche, avec un bandeau (date, facture créée ou motif du refus)"),
      m("Pages client guidées : une frise « consulter, répondre, régler », de grands boutons faciles à toucher et un suivi animé de la validation sur le téléphone"),
      m("Votre logo et votre identité sur les devis, les factures, les emails et les pages envoyées à vos clients"),
      m("Votre logo en filigrane discret sur chaque page de vos devis, factures, bons de commande, reçus et factures d'acompte, désactivable en un clic"),
      m("Aperçu avant envoi d'un devis ou d'une facture : l'email tel que le client le recevra (destinataire, objet, message) à côté du vrai PDF joint, et envoi depuis cet aperçu"),
      m("Souche de chaque email envoyé à vos clients (destinataire, message, pièces jointes, date, auteur), consultable et filtrable dans Paramètres"),
      m("Achats : fiches fournisseurs et bons de commande d'achat, convertibles directement en facture fournisseur"),
      m("Suivi des factures fournisseurs en retard, distinct du suivi des impayés clients ; une facture se marque payée ou s'annule en gardant l'historique"),
      m("Comptabilité : plan comptable conforme au référentiel SYSCOHADA (classes 1 à 8), soldes calculés automatiquement par entreprise"),
      m("Journaux manuels, rapprochement bancaire par import de relevé, et budgets comparés au réalisé par compte"),
      m("Verrouillage d'une période comptable une fois clôturée"),
      m("La comptabilité reste réservée à l'Administrateur — jamais visible d'un simple employé"),
    ],
  },
  {
    slug: "rh",
    nom: m("One People"),
    resume: m("Dossiers employés, congés, pointage et suivi d'activité — hors paie."),
    categorie: m("Gestion d'équipe"),
    icone: Users,
    classeFond: "bg-purple-500",
    capacites: [
      m("Invitation envoyée par email à chaque collaborateur : il choisit son mot de passe, puis se connecte avec son adresse email"),
      m("Réglage « Les managers voient toute l'entreprise » : vos managers voient les données métier de toute l'entreprise, ou seulement celles de leur équipe"),
      m("Recrutement partagé entre les entreprises d'un même groupe : postes et candidatures visibles et gérables par les managers de chacune, sur activation des deux côtés"),
      m("Stagiaires professionnels (période probatoire, décision embauché ou non retenu) et académiques (école, convention, maître de stage, évaluation), avec l'indemnité réservée à l'Administrateur"),
      m("Fiche de présence journalière tenue par un gérant (Manager) que l'Administrateur peut changer, avec PDF prêt à imprimer, et jonction possible des entreprises d'un même groupe pour gérer tous les employés au même endroit"),
      m("Dossier RH créé automatiquement à l'activation d'un compte employé (poste, contrat, date d'embauche)"),
      m("Salaire jamais rempli automatiquement, visible uniquement par l'Administrateur et l'intéressé"),
      m("Demandes de congés avec politiques configurables, pointage, suivi d'activité par employé"),
      m("Sondages internes et tickets RH par catégorie"),
      m("Hiérarchie de management à plusieurs niveaux — un manager voit toute son équipe étendue, pas seulement ses subordonnés directs"),
      m("Retirer l'accès d'un Manager, d'un Employé ou d'un client du portail en un clic, avec confirmation — son historique (documents, tâches, messages) reste"),
      m("Organisation par département, avec visibilité RH cloisonnée entre départements — un manager ne voit que le sien, sauf permission explicite de l'Administrateur"),
    ],
  },
  {
    slug: "recrutement",
    nom: m("One Recruit"),
    resume: m("Postes ouverts, candidatures et conversion directe en compte employé."),
    categorie: m("Gestion d'équipe"),
    icone: Briefcase,
    classeFond: "bg-pink-500",
    capacites: [
      m("Postes ouverts et candidatures avec CV stocké en toute sécurité"),
      m("Suivi du candidat de Reçue à Entretien, Offre puis Embauche"),
      m("Conversion d'une candidature embauchée directement en compte utilisateur, sans ressaisie"),
      m("Page carrières publique aux couleurs de l'entreprise, avec dépôt de candidature et CV"),
      m("Offres modifiables à tout moment, désactivables puis réactivables ; une offre qui a déjà reçu des candidatures se désactive au lieu de se supprimer"),
      m("Candidatures corrigeables, annulables (et rétablissables) ou supprimables avec effacement réel du CV"),
      m("Le candidat est prévenu par email à chaque changement de statut de sa candidature (en examen, entretien, offre, embauche, rejet), au nom de votre entreprise — textes personnalisables avec aperçu ; à chaque changement, vous relisez et modifiez le message avant son envoi, ou changez le statut sans prévenir ; envoi désactivable"),
    ],
  },
  {
    slug: "assistance-client",
    nom: m("One Desk"),
    resume: m("Tickets clients par catégorie, avec assignation et suivi de résolution."),
    categorie: m("Gestion opérationnelle"),
    icone: LifeBuoy,
    classeFond: "bg-cyan-500",
    capacites: [
      m("Espace client : vos clients retrouvent leurs factures (avec le reste à payer), leurs devis et leurs tickets, et ouvrent chaque document pour payer, accepter ou répondre"),
      m("Tickets rattachés à un Contact (pas nécessairement un utilisateur du portail)"),
      m("Catégories avec agent par défaut, assignation manuelle possible"),
      m("Suivi du statut de Ouvert à Résolu, avec horodatage de la résolution"),
    ],
  },
  {
    slug: "reservations",
    nom: m("One Bookings"),
    resume: m("Prise de rendez-vous en ligne, services, disponibilités et intervenants."),
    categorie: m("Gestion opérationnelle"),
    icone: CalendarCheck,
    classeFond: "bg-rose-500",
    capacites: [
      m("Services réservables avec durée, tampon entre rendez-vous et prix en FCFA"),
      m("Disponibilités hebdomadaires par intervenant, y compris les coupures (ex. pause déjeuner)"),
      m("Prix et durée figés au moment de la réservation — une modification ultérieure du service ne change rien aux rendez-vous déjà pris"),
      m("Page de réservation publique, partageable directement avec vos clients"),
      m("Réservation guidée en cinq étapes (service, personne, date, créneau, coordonnées), avec les créneaux libres affichés en direct"),
    ],
  },
  {
    slug: "projets",
    nom: m("One Projects"),
    resume: m("Dossiers clients permanents et projets bornés, avec feuille de temps."),
    categorie: m("Gestion opérationnelle"),
    icone: FolderKanban,
    classeFond: "bg-indigo-500",
    capacites: [
      m("Distinction claire entre un Dossier client (permanent) et un Projet (une mission précise, avec une fin)"),
      m("Vocabulaire adapté à votre secteur (Chantier pour un artisan, Mission pour un cabinet)"),
      m("Feuille de temps avec minuteur démarrable/arrêtable directement sur une tâche"),
      m("Documents et demandes de signature rattachés directement au projet"),
    ],
  },
  {
    slug: "documents-signatures",
    nom: m("One Docs & Sign"),
    resume: m("Stockage classé par sensibilité et signature électronique avec preuve."),
    categorie: m("Communication & documents"),
    icone: FileSignature,
    classeFond: "bg-violet-500",
    capacites: [
      m("Documents classés par catégorie — les pièces d'identité et données de santé restent réservées au responsable du dossier et à l'Administrateur, avec journalisation de chaque consultation"),
      m("Signature électronique avec empreinte du document au moment de l'envoi"),
      m("Code de vérification envoyé par email, adresse IP, appareil et consentement capturés dans un certificat d'audit consultable"),
      m("Supprimer ou remplacer un document depuis One Docs, avec confirmation"),
      m("Rédiger un document directement dans Vertex One — titres, listes, tableaux et images, avec l'en-tête de votre entreprise, un pied de page et des numéros de page — puis le télécharger en PDF ou en Word, ou l'ajouter à vos documents"),
      m("Envoi d'un contrat au client depuis son dossier : il lit le document, le signe ou le refuse en indiquant pourquoi"),
      m("À la signature, le contrat signé et son certificat horodaté (date et heure de Yaoundé) sont rangés directement dans le dossier du client et envoyés à l'Administrateur et au signataire"),
    ],
  },
  {
    slug: "marketing",
    nom: m("One Marketing"),
    resume: m("Campagnes email, pages d'atterrissage et relances automatiques — WhatsApp bientôt."),
    categorie: m("Communication & documents"),
    icone: Megaphone,
    classeFond: "bg-fuchsia-500",
    capacites: [
      m("Campagnes par email, ciblées par statut de prospect ou ancienneté d'inactivité — l'envoi par WhatsApp arrivera dans une prochaine mise à jour"),
      m("Pages d'atterrissage publiques pour capter de nouveaux prospects"),
      m("Automatisations prêtes à l'emploi — par exemple relancer un prospect resté sans réponse depuis 7 jours"),
    ],
  },
  {
    slug: "one-form",
    nom: m("One Form"),
    resume: m("Formulaires personnalisés à publier via un lien public, réponses centralisées."),
    categorie: m("Communication & documents"),
    icone: ClipboardList,
    classeFond: "bg-lime-500",
    capacites: [
      m("10 types de champs (texte, email, téléphone, nombre, date, choix unique ou multiple, liste déroulante, fichier joint)"),
      m("8 modèles prêts à l'emploi : contact, demande de devis, accompagnement visa, candidature, satisfaction client, inscription à un événement, assistance et rendez-vous"),
      m("Formulaire modifiable, désactivable ou supprimable depuis la liste, champ par champ"),
      m("Lien public partageable, sans compte ni connexion requise pour y répondre"),
      m("Réponses centralisées et consultables directement dans l'application"),
      m("Création automatique d'un Lead CRM à chaque réponse, en option"),
      m("Notification par email à chaque nouvelle réponse, en option"),
      m("Protection anti-spam intégrée sur le formulaire public"),
      m("Disponibilité programmable : date d'ouverture, date de fermeture, nombre maximal de réponses"),
    ],
  },
  {
    slug: "one-vault",
    nom: m("One Vault"),
    resume: m("Identifiants et notes sensibles chiffrés, privés ou partagés avec l'équipe."),
    categorie: m("Communication & documents"),
    icone: KeyRound,
    classeFond: "bg-yellow-500",
    capacites: [
      m("Mots de passe et notes chiffrés au repos, jamais stockés en clair"),
      m("Chaque secret est privé par défaut, visible uniquement par son créateur et l'Administrateur"),
      m("Partage avec toute l'équipe en un clic, pour les identifiants communs"),
      m("Générateur de mot de passe intégré"),
      m("Journal de consultation à chaque révélation d'un mot de passe"),
    ],
  },
  {
    slug: "communication-interne",
    nom: m("One Chat"),
    resume: m("Messagerie d'équipe : canaux, messages directs, groupes privés, fils et pièces jointes."),
    categorie: m("Communication & documents"),
    icone: MessageSquare,
    classeFond: "bg-sky-500",
    capacites: [
      m("Canaux par projet, par équipe ou libres, avec un canal Général créé pour vous"),
      m("Messages directs et groupes privés, visibles de leurs seuls membres — pas même de l'Administrateur"),
      m("Pièces jointes (images, PDF, Word, Excel), réactions par emoji et fils de discussion qui n'encombrent pas la conversation"),
      m("Mentions @nom avec auto-complétion, prévenues par email quand elles restent sans lecture"),
      m("Recherche dans les messages, limitée aux conversations auxquelles vous avez accès"),
      m("Présence en ligne, compteur de messages non lus et notifications du navigateur"),
      m("Notifications instantanées, même application fermée, réglables par chaque personne, avec mise en sourdine d'un canal"),
      m("Réponse à un message précis avec aperçu cliquable du message d'origine"),
      m("Interface moderne et animée : avatars, présence, emojis et bouton « nouveaux messages »"),
      m("Fil d'annonces internes façon intranet, avec pièces jointes (images, PDF, Word, Excel)"),
      m("Isolation stricte entre entreprises clientes"),
    ],
  },
];

export function trouverModuleMarketing(slug: string): ModuleMarketing | undefined {
  return MODULES_MARKETING.find((m) => m.slug === slug);
}
