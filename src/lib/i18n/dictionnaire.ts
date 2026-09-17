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
    // Noms de marque "One <mot anglais>" à l'image de Zoho (Zoho CRM, Zoho
    // Books, Zoho People, Zoho Sign...) — jamais traduits, identiques en
    // français et en anglais (échange du 2026-09-17). Voir src/lib/i18n/nav.ts
    // pour la table de correspondance libelle → clé.
    crm: "One CRM",
    faco: "One Books",
    projets: "One Projects",
    documents: "One Docs",
    messagerie: "One Chat",
    annonces: "One Announcements",
    signatures: "One Sign",
    rh: "One People",
    marketing: "One Marketing",
    reservations: "One Bookings",
    recrutement: "One Recruit",
    support: "One Desk",
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
    rh: { titre: "One People" },
    reservations: { titre: "One Bookings" },
    recrutement: { titre: "One Recruit" },
    support: { titre: "One Desk" },
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
    // Mêmes noms de marque qu'en français (voir le commentaire sur `fr`
    // ci-dessus) — un nom de produit ne se traduit pas.
    crm: "One CRM",
    faco: "One Books",
    projets: "One Projects",
    documents: "One Docs",
    messagerie: "One Chat",
    annonces: "One Announcements",
    signatures: "One Sign",
    rh: "One People",
    marketing: "One Marketing",
    reservations: "One Bookings",
    recrutement: "One Recruit",
    support: "One Desk",
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
    rh: { titre: "One People" },
    reservations: { titre: "One Bookings" },
    recrutement: { titre: "One Recruit" },
    support: { titre: "One Desk" },
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
