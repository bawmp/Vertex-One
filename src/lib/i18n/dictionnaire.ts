/**
 * Infrastructure de traduction (Tranche 2, 2026-09-13) — décision prise avec
 * l'utilisateur : "infrastructure + écrans les plus visibles", jamais
 * l'application entière (~220 fichiers d'écran en français codé en dur,
 * traduire tout en une tranche n'est pas réaliste). Couvre ici la sidebar
 * (libellés de premier niveau + catégories) et l'en-tête des accueils
 * CRM/FACO/RH/Réservations/Recrutement/Assistance client/Paramètres, plus
 * "Mon compte" et le pied de sidebar (MenuUtilisateur) — tout le reste
 * (formulaires, tableaux, messages d'erreur de chaque module) reste en
 * français, à traduire module par module dans de futures tranches. Jamais
 * fabriqué comme "déjà bilingue" au-delà de ce qui est listé ici.
 */
export const fr = {
  nav: {
    crm: "CRM",
    faco: "FACO",
    projets: "Projets",
    documents: "Documents",
    messagerie: "Messagerie",
    annonces: "Annonces",
    signatures: "Signatures",
    rh: "Ressources Humaines",
    marketing: "Marketing",
    reservations: "Réservations",
    recrutement: "Recrutement",
    support: "Assistance client",
    parametres: "Paramètres",
    monCompte: "Mon compte",
    monEspace: "Espace personnel",
    categories: {
      articles: "Articles",
      ventes: "Ventes",
      achats: "Achats",
      suiviHeures: "Suivi des heures",
      banque: "Banque",
      comptable: "Comptable",
      rapports: "Rapports",
      documentsFinanciers: "Documents",
      presence: "Présence",
      conges: "Congés",
      assistance: "Assistance",
      sondages: "Sondages",
    },
  },
  pages: {
    crm: { bienvenue: "Bienvenue, {nom}", sousTitre: "Accueil de votre activité commerciale." },
    faco: { bonjour: "Bonjour, {nom}" },
    rh: { titre: "Ressources Humaines" },
    reservations: { titre: "Réservations" },
    recrutement: { titre: "Recrutement" },
    support: { titre: "Assistance client" },
    parametres: { titre: "Paramètres" },
    monEspace: { titre: "Espace personnel" },
  },
  menuUtilisateur: {
    deconnexion: "Se déconnecter",
  },
  monCompte: {
    titre: "Mon compte",
    preferences: "Préférences",
    langue: "Langue",
    francais: "Français",
    anglais: "Anglais",
    theme: "Thème",
    clair: "Clair",
    sombre: "Sombre",
    systeme: "Système (suit l'appareil)",
    ordreModulesTitre: "Ordre des modules",
    ordreModulesDescription: "Réorganisez l'ordre d'affichage des modules dans la barre latérale — ce réglage n'affecte que votre propre compte.",
    monter: "Monter",
    descendre: "Descendre",
  },
};

export type Dictionnaire = typeof fr;

/**
 * Repli récursif : toute clé absente d'`en` retombe sur la valeur `fr`
 * correspondante — jamais un texte cassé/vide pour un écran pas encore
 * traduit. `en` peut donc rester volontairement partiel.
 */
type Profond<T> = { [K in keyof T]?: T[K] extends object ? Profond<T[K]> : T[K] };

export const en: Profond<Dictionnaire> = {
  nav: {
    crm: "CRM",
    faco: "Finance",
    projets: "Projects",
    documents: "Documents",
    messagerie: "Messages",
    annonces: "Announcements",
    signatures: "Signatures",
    rh: "Human Resources",
    marketing: "Marketing",
    reservations: "Bookings",
    recrutement: "Recruitment",
    support: "Customer support",
    parametres: "Settings",
    monCompte: "My account",
    monEspace: "Personal space",
    categories: {
      articles: "Items",
      ventes: "Sales",
      achats: "Purchases",
      suiviHeures: "Time tracking",
      banque: "Banking",
      comptable: "Accounting",
      rapports: "Reports",
      documentsFinanciers: "Documents",
      presence: "Attendance",
      conges: "Leave",
      assistance: "Support",
      sondages: "Surveys",
    },
  },
  pages: {
    crm: { bienvenue: "Welcome, {nom}", sousTitre: "Your sales activity at a glance." },
    faco: { bonjour: "Hello, {nom}" },
    rh: { titre: "Human Resources" },
    reservations: { titre: "Bookings" },
    recrutement: { titre: "Recruitment" },
    support: { titre: "Customer support" },
    parametres: { titre: "Settings" },
    monEspace: { titre: "Personal space" },
  },
  menuUtilisateur: {
    deconnexion: "Sign out",
  },
  monCompte: {
    titre: "My account",
    preferences: "Preferences",
    langue: "Language",
    francais: "French",
    anglais: "English",
    theme: "Theme",
    clair: "Light",
    sombre: "Dark",
    systeme: "System (matches device)",
    ordreModulesTitre: "Module order",
    ordreModulesDescription: "Reorder how modules appear in the sidebar — this only affects your own account.",
    monter: "Move up",
    descendre: "Move down",
  },
};
