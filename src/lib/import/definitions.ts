import type { Module } from "@/lib/permissions";
import { normaliser } from "./valeurs";
import { m } from "@/lib/i18n/catalogue";

export const TYPES_IMPORT = ["CONTACTS", "LEADS", "DEALS", "PRODUITS", "PROJETS_TACHES", "DEVIS", "FACTURES", "NOTES", "CHAMPS_CONTACT", "MODELES_EMAIL"] as const;
export type TypeImport = (typeof TYPES_IMPORT)[number];

export type ChampImport = {
  cle: string;
  libelle: string;
  obligatoire?: boolean;
  /** Noms d'en-têtes reconnus automatiquement (Asana, Zoho, français, anglais) — comparés après normalisation. */
  alias: string[];
};

export type DefinitionImport = {
  type: TypeImport;
  libelle: string;
  description: string;
  /** Droit `CREER` exigé sur ce module. */
  module: Module;
  /** Réservé à l'Administrateur (finances de l'entreprise, note privée). */
  adminSeulement: boolean;
  /** Où trouver l'export dans les applications d'origine. */
  conseils: { source: string; texte: string }[];
  champs: ChampImport[];
};

export const DEFINITIONS: Record<TypeImport, DefinitionImport> = {
  CONTACTS: {
    type: "CONTACTS",
    libelle: m("Contacts et entreprises clientes"),
    description: m("Un contact par ligne. La société indiquée est créée si elle n'existe pas encore ; un contact déjà présent (même email ou même téléphone) est ignoré."),
    module: "CRM",
    adminSeulement: false,
    conseils: [
      { source: m("Zoho CRM / Zoho One"), texte: m("Module Contacts → ⋯ → Exporter les contacts → CSV ou XLS.") },
      { source: m("Zoho Books"), texte: m("Clients → ⋯ → Exporter les clients.") },
      { source: m("Autre application"), texte: m("Tout export CSV ou Excel avec une colonne de noms ; le reste s'associe à l'écran suivant.") },
    ],
    champs: [
      { cle: "prenom", libelle: m("Prénom"), alias: ["first name", "prenom", "firstname", "given name"] },
      { cle: "nom", libelle: m("Nom"), obligatoire: true, alias: ["last name", "nom", "name", "full name", "contact name", "nom complet", "display name", "lastname", "nom du contact", "customer name"] },
      { cle: "entreprise", libelle: m("Société"), alias: ["account name", "company", "company name", "entreprise", "societe", "organisation", "organization", "nom de l entreprise", "nom de la societe"] },
      { cle: "email", libelle: m("Email"), alias: ["email", "e mail", "emailid", "email id", "courriel", "adresse email", "adresse e mail", "mail"] },
      { cle: "telephone", libelle: m("Téléphone"), alias: ["phone", "telephone", "tel", "numero de telephone", "work phone", "phone number", "mobile", "mobilephone", "mobile phone", "cell", "portable", "whatsapp"] },
      { cle: "fonction", libelle: m("Fonction"), alias: ["title", "job title", "fonction", "poste", "designation", "role"] },
      { cle: "niu", libelle: m("NIU (société)"), alias: ["niu", "tax id", "cf taxid", "tax number", "numero contribuable", "n contribuable"] },
      { cle: "notes", libelle: m("Notes"), alias: ["description", "notes", "note", "remarques", "commentaire", "commentaires", "comments"] },
      { cle: "proprietaire", libelle: m("Responsable (email ou nom)"), alias: ["contact owner", "owner", "proprietaire", "responsable", "assigned to", "assigne a", "account owner"] },
    ],
  },
  PRODUITS: {
    type: "PRODUITS",
    libelle: m("Produits et services"),
    description: m("Un produit ou service par ligne. Un article déjà présent sous le même nom est ignoré. Les prix sont en francs CFA."),
    module: "PRODUITS",
    adminSeulement: false,
    conseils: [
      { source: m("Zoho Books / Inventory"), texte: m("Articles → ⋯ → Exporter les articles.") },
      { source: m("Zoho CRM"), texte: m("Module Produits → Exporter les produits.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec au minimum le nom et le prix.") },
    ],
    champs: [
      { cle: "nom", libelle: m("Nom"), obligatoire: true, alias: ["item name", "product name", "name", "nom", "produit", "designation", "article", "service name", "libelle", "nom du produit"] },
      { cle: "description", libelle: m("Description"), alias: ["description", "sales description", "notes", "details"] },
      { cle: "type", libelle: m("Type (bien ou service)"), alias: ["item type", "product type", "type", "type d article", "product category", "categorie"] },
      { cle: "prixVente", libelle: m("Prix de vente"), alias: ["rate", "selling price", "unit price", "prix", "prix de vente", "price", "sales price", "tarif", "prix unitaire", "sales rate"] },
      { cle: "prixAchat", libelle: m("Prix d'achat"), alias: ["purchase rate", "cost price", "unit cost", "prix d achat", "cout", "purchase price", "cout d achat", "cost"] },
      { cle: "stock", libelle: m("Stock"), alias: ["stock on hand", "quantity in stock", "qty in stock", "stock", "quantite en stock", "initial stock", "opening stock", "quantity"] },
    ],
  },
  PROJETS_TACHES: {
    type: "PROJETS_TACHES",
    libelle: m("Projets et tâches"),
    description: m("Une tâche par ligne, rangée dans le projet indiqué (créé s'il n'existe pas). Une tâche déjà présente dans le même projet sous le même titre est ignorée."),
    module: "PROJETS",
    adminSeulement: false,
    conseils: [
      { source: m("Asana"), texte: m("Ouvrez le projet → menu ▾ à côté du nom → Exporter / Imprimer → CSV. Un fichier par projet, ou l'export complet d'un portefeuille.") },
      { source: m("Zoho Projects"), texte: m("Tâches → Exporter au format CSV.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec au moins le titre de la tâche.") },
    ],
    champs: [
      { cle: "titre", libelle: m("Titre de la tâche"), obligatoire: true, alias: ["name", "task name", "nom", "titre", "tache", "task", "title", "nom de la tache", "task title"] },
      { cle: "projet", libelle: m("Projet"), alias: ["projects", "project", "projet", "projets", "nom du projet", "project name", "task list", "liste"] },
      { cle: "section", libelle: m("Section / colonne / statut"), alias: ["section column", "section", "colonne", "board column", "status", "statut", "task status", "etat"] },
      { cle: "terminee", libelle: m("Terminée (date ou oui/non)"), alias: ["completed at", "completed", "terminee le", "date de fin reelle", "completed on", "terminee", "done", "termine"] },
      { cle: "assigne", libelle: m("Responsable (nom)"), alias: ["assignee", "assigned to", "responsable", "assigne a", "owner", "task owner", "proprietaire"] },
      { cle: "assigneEmail", libelle: m("Responsable (email)"), alias: ["assignee email", "email du responsable", "owner email", "email responsable"] },
      { cle: "echeance", libelle: m("Échéance"), alias: ["due date", "due", "echeance", "date d echeance", "date limite", "end date", "date de fin", "deadline"] },
      { cle: "debut", libelle: m("Date de début"), alias: ["start date", "date de debut", "start", "debut"] },
      { cle: "notes", libelle: m("Notes de la tâche"), alias: ["notes", "description", "task description", "details"] },
      { cle: "parent", libelle: m("Tâche parente"), alias: ["parent task", "parent", "tache parente", "parent id"] },
    ],
  },
  DEVIS: {
    type: "DEVIS",
    libelle: m("Devis historiques"),
    description:
      m("Reprise de l'historique : chaque devis garde son numéro d'origine, sans génération d'écriture comptable. Plusieurs lignes portant le même numéro forment un seul devis. Le client est retrouvé par email, téléphone ou nom, ou créé s'il n'existe pas."),
    module: "FACTURATION",
    adminSeulement: true,
    conseils: [
      { source: m("Zoho Books"), texte: m("Devis → ⋯ → Exporter les devis. Cochez « Exporter avec les lignes » pour garder le détail.") },
      { source: m("Zoho One / Zoho CRM"), texte: m("Module Devis → Exporter.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec numéro, client, date et montant (ou lignes détaillées).") },
    ],
    champs: [],
  },
  FACTURES: {
    type: "FACTURES",
    libelle: m("Factures historiques"),
    description:
      m("Reprise de l'historique : chaque facture garde son numéro d'origine, ne reçoit aucune écriture comptable et ne peut jamais être supprimée. Plusieurs lignes portant le même numéro forment une seule facture. Les factures payées reçoivent un règlement « saisie manuelle »."),
    module: "FACTURATION",
    adminSeulement: true,
    conseils: [
      { source: m("Zoho Books"), texte: m("Factures → ⋯ → Exporter les factures. Cochez « Exporter avec les lignes » pour garder le détail.") },
      { source: m("Zoho One / Zoho CRM"), texte: m("Module Factures → Exporter.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec numéro, client, date, échéance, statut et montant (ou lignes détaillées).") },
    ],
    champs: [],
  },
  NOTES: {
    type: "NOTES",
    libelle: m("Notes personnelles"),
    description: m("Chaque note est ajoutée à la suite de votre bloc-notes privé, sous son titre. Une note déjà présente n'est pas ajoutée une seconde fois."),
    module: "PARAMETRES",
    adminSeulement: true,
    conseils: [
      { source: m("Zoho Notebook / Zoho One"), texte: m("Exportez vos notes en CSV ou Excel (titre et contenu).") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec une colonne de contenu et, si possible, une colonne de titre.") },
    ],
    champs: [
      { cle: "titre", libelle: m("Titre"), alias: ["title", "titre", "name", "subject", "objet", "note title", "nom"] },
      { cle: "contenu", libelle: m("Contenu"), obligatoire: true, alias: ["content", "contenu", "note", "notes", "body", "text", "texte", "description", "note content", "message"] },
      { cle: "date", libelle: m("Date"), alias: ["created time", "created at", "date", "created", "date de creation", "modified time"] },
    ],
  },
  LEADS: {
    type: "LEADS",
    libelle: m("Leads (prospects)"),
    description: m("Un lead par ligne. Un lead déjà présent (même email ou même téléphone) est ignoré. Pour reprendre les données d'un autre espace Vertex One, importez le fichier exporté depuis cet espace : les colonnes sont reconnues d'elles-mêmes."),
    module: "CRM",
    adminSeulement: false,
    conseils: [
      { source: m("Un autre espace Vertex One"), texte: m("Paramètres → Exporter mes données → Leads, puis importez le fichier ici.") },
      { source: m("Zoho CRM"), texte: m("Module Leads → Exporter les leads.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec au minimum le nom et un téléphone ou un email.") },
    ],
    champs: [
      { cle: "prenom", libelle: m("Prénom"), alias: ["first name", "prenom", "firstname", "given name"] },
      { cle: "nom", libelle: m("Nom"), obligatoire: true, alias: ["last name", "nom", "name", "full name", "lead name", "nom complet", "contact name", "lastname"] },
      { cle: "societe", libelle: m("Société"), alias: ["company", "company name", "societe", "entreprise", "organisation", "account name"] },
      { cle: "email", libelle: m("Email"), alias: ["email", "e mail", "emailid", "email id", "courriel", "adresse email"] },
      { cle: "telephone", libelle: m("Téléphone"), alias: ["phone", "telephone", "tel", "mobile", "whatsapp", "numero de telephone", "work phone"] },
      { cle: "statut", libelle: m("Statut"), alias: ["lead status", "status", "statut", "etat", "statut du lead"] },
      { cle: "notes", libelle: m("Notes"), alias: ["description", "notes", "note", "remarques", "commentaires", "comments"] },
      { cle: "proprietaire", libelle: m("Responsable (email ou nom)"), alias: ["lead owner", "owner", "proprietaire", "responsable", "assigne a", "assigned to"] },
    ],
  },
  DEALS: {
    type: "DEALS",
    libelle: m("Deals (opportunités)"),
    description: m("Un deal par ligne, rattaché à son contact (retrouvé par email, téléphone ou nom ; créé s'il n'existe pas). Un deal déjà présent sous le même titre pour le même contact est ignoré."),
    module: "CRM",
    adminSeulement: false,
    conseils: [
      { source: m("Un autre espace Vertex One"), texte: m("Paramètres → Exporter mes données → Deals, puis importez le fichier ici. Importez d'abord les contacts.") },
      { source: m("Zoho CRM"), texte: m("Module Deals (Potentials) → Exporter les deals.") },
      { source: m("Autre application"), texte: m("Un CSV ou Excel avec le titre du deal et le nom du contact.") },
    ],
    champs: [
      { cle: "titre", libelle: m("Titre du deal"), obligatoire: true, alias: ["deal name", "titre", "nom du deal", "title", "opportunity name", "potential name", "nom de l opportunite", "name"] },
      { cle: "contact", libelle: m("Contact (nom)"), obligatoire: true, alias: ["contact name", "contact", "nom du contact", "client", "customer name", "account name", "company"] },
      { cle: "contactEmail", libelle: m("Contact (email)"), alias: ["contact email", "email", "email du contact", "courriel du contact"] },
      { cle: "contactTelephone", libelle: m("Contact (téléphone)"), alias: ["contact phone", "phone", "telephone du contact", "mobile"] },
      { cle: "montant", libelle: m("Montant (FCFA)"), alias: ["amount", "montant", "deal amount", "value", "valeur", "expected revenue", "montant estime"] },
      { cle: "statut", libelle: m("Étape"), alias: ["stage", "etape", "deal stage", "statut", "status", "phase"] },
      { cle: "dateCloture", libelle: m("Clôture estimée"), alias: ["closing date", "close date", "date de cloture", "cloture estimee", "expected close date", "date de cloture estimee"] },
      { cle: "proprietaire", libelle: m("Responsable (email ou nom)"), alias: ["deal owner", "owner", "proprietaire", "responsable", "assigne a", "assigned to"] },
    ],
  },
  CHAMPS_CONTACT: {
    type: "CHAMPS_CONTACT",
    libelle: m("Champs personnalisés du contact"),
    description: m("La structure de la fiche contact d'un autre espace : un champ par ligne. Un champ déjà présent sous le même nom est ignoré. Seuls les champs sont repris, pas les valeurs saisies sur les contacts."),
    module: "PARAMETRES",
    adminSeulement: true,
    conseils: [
      { source: m("Un autre espace Vertex One"), texte: m("Paramètres → Exporter mes données → Champs personnalisés, puis importez le fichier ici.") },
    ],
    champs: [
      { cle: "libelle", libelle: m("Nom du champ"), obligatoire: true, alias: ["label", "libelle", "nom", "field name", "nom du champ", "champ"] },
      { cle: "type", libelle: m("Type de champ"), alias: ["type", "field type", "type de champ"] },
      { cle: "obligatoire", libelle: m("Obligatoire"), alias: ["required", "obligatoire", "mandatory"] },
      { cle: "options", libelle: m("Choix (liste déroulante)"), alias: ["options", "choices", "choix", "valeurs", "liste"] },
    ],
  },
  MODELES_EMAIL: {
    type: "MODELES_EMAIL",
    libelle: m("Modèles d'email"),
    description: m("Les textes d'envoi des devis et des factures d'un autre espace. Un modèle déjà personnalisé dans cet espace n'est jamais écrasé."),
    module: "PARAMETRES",
    adminSeulement: true,
    conseils: [
      { source: m("Un autre espace Vertex One"), texte: m("Paramètres → Exporter mes données → Modèles d'email, puis importez le fichier ici.") },
    ],
    champs: [
      { cle: "type", libelle: m("Modèle"), obligatoire: true, alias: ["type", "template", "modele", "nom du modele", "template type"] },
      { cle: "objet", libelle: m("Objet"), obligatoire: true, alias: ["subject", "objet", "sujet"] },
      { cle: "corps", libelle: m("Corps du message"), obligatoire: true, alias: ["body", "corps", "message", "contenu", "texte"] },
    ],
  },
};

const CHAMPS_DOCUMENT_COMMUNS: ChampImport[] = [
  { cle: "client", libelle: m("Client (nom)"), obligatoire: true, alias: ["customer name", "client", "nom du client", "contact name", "customer", "billed to", "nom client", "company name", "account name"] },
  { cle: "clientEmail", libelle: m("Client (email)"), alias: ["customer email", "email", "emailid", "email id", "email du client", "courriel"] },
  { cle: "clientTelephone", libelle: m("Client (téléphone)"), alias: ["customer phone", "phone", "telephone", "mobile", "mobilephone", "telephone du client"] },
  { cle: "date", libelle: m("Date d'émission"), alias: ["invoice date", "estimate date", "quote date", "date", "date d emission", "date de facture", "date du devis", "created date", "issue date", "created time"] },
  { cle: "designation", libelle: m("Ligne : désignation"), alias: ["item name", "item desc", "description", "designation", "libelle", "product name", "item description", "produit", "article"] },
  { cle: "quantite", libelle: m("Ligne : quantité"), alias: ["quantity", "qty", "quantite", "qte"] },
  { cle: "prixUnitaire", libelle: m("Ligne : prix unitaire"), alias: ["item price", "rate", "unit price", "prix unitaire", "pu", "price", "prix", "item rate"] },
  { cle: "tauxTVA", libelle: m("Taux de TVA (%)"), alias: ["item tax %", "tax percentage", "tva", "taux tva", "tax rate", "taux de tva", "tax %", "item tax percentage", "tva %"] },
  { cle: "totalHT", libelle: m("Total HT (si une ligne par document)"), alias: ["sub total", "subtotal", "total ht", "montant ht", "hors taxes", "amount excl tax"] },
  { cle: "totalTTC", libelle: m("Total TTC (si une ligne par document)"), alias: ["total", "amount", "montant", "montant ttc", "total ttc", "grand total", "net a payer", "total amount"] },
];

DEFINITIONS.FACTURES.champs = [
  { cle: "numero", libelle: m("Numéro de facture"), obligatoire: true, alias: ["invoice number", "invoice", "numero", "numero de facture", "n facture", "number", "reference", "invoice no", "facture"] },
  ...CHAMPS_DOCUMENT_COMMUNS,
  { cle: "echeance", libelle: m("Date d'échéance"), alias: ["due date", "date d echeance", "echeance", "payment due date", "date limite de paiement"] },
  { cle: "statut", libelle: m("Statut"), alias: ["invoice status", "status", "statut", "etat", "statut de la facture"] },
  { cle: "montantPaye", libelle: m("Montant déjà payé"), alias: ["amount paid", "paid amount", "montant paye", "payment made", "paye", "deja paye"] },
  { cle: "datePaiement", libelle: m("Date du paiement"), alias: ["payment date", "date de paiement", "paid on", "paye le", "last payment date"] },
];

DEFINITIONS.DEVIS.champs = [
  { cle: "numero", libelle: m("Numéro de devis"), obligatoire: true, alias: ["estimate number", "quote number", "quote", "estimate", "numero", "numero de devis", "n devis", "number", "reference", "devis"] },
  ...CHAMPS_DOCUMENT_COMMUNS,
  { cle: "echeance", libelle: m("Date de validité"), alias: ["expiry date", "valid until", "date de validite", "validite", "expiration date", "valable jusqu au", "due date"] },
  { cle: "statut", libelle: m("Statut"), alias: ["estimate status", "quote status", "status", "statut", "etat", "statut du devis"] },
];

/** Associe automatiquement chaque champ à l'en-tête qui porte un de ses noms connus (jamais deux champs sur la même colonne). */
export function proposerCorrespondance(entetes: string[], champs: ChampImport[]): Record<string, string> {
  const parNormalise = new Map<string, string>();
  for (const e of entetes) if (!parNormalise.has(normaliser(e))) parNormalise.set(normaliser(e), e);
  const utilises = new Set<string>();
  const correspondance: Record<string, string> = {};
  for (const champ of champs) {
    // Le libellé du champ compte aussi : un fichier exporté par Vertex One porte exactement ces en-têtes et se relit seul.
    for (const alias of [...champ.alias, champ.libelle]) {
      const entete = parNormalise.get(normaliser(alias)); // l'alias aussi : « item tax % » s'écrit « item tax » une fois normalisé
      if (entete && !utilises.has(entete)) {
        correspondance[champ.cle] = entete;
        utilises.add(entete);
        break;
      }
    }
  }
  return correspondance;
}

/** Ne garde de la correspondance reçue que des champs connus et des en-têtes réellement présents dans le fichier. */
export function assainirCorrespondance(brute: unknown, champs: ChampImport[], entetes: string[]): Record<string, string> {
  const resultat: Record<string, string> = {};
  if (!brute || typeof brute !== "object") return resultat;
  const valides = new Set(champs.map((c) => c.cle));
  const presents = new Set(entetes);
  for (const [cle, entete] of Object.entries(brute as Record<string, unknown>)) {
    if (valides.has(cle) && typeof entete === "string" && presents.has(entete)) resultat[cle] = entete;
  }
  return resultat;
}
