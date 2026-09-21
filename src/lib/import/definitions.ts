import type { Module } from "@/lib/permissions";
import { normaliser } from "./valeurs";

export const TYPES_IMPORT = ["CONTACTS", "PRODUITS", "PROJETS_TACHES", "DEVIS", "FACTURES", "NOTES"] as const;
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
    libelle: "Contacts et entreprises clientes",
    description: "Un contact par ligne. La société indiquée est créée si elle n'existe pas encore ; un contact déjà présent (même email ou même téléphone) est ignoré.",
    module: "CRM",
    adminSeulement: false,
    conseils: [
      { source: "Zoho CRM / Zoho One", texte: "Module Contacts → ⋯ → Exporter les contacts → CSV ou XLS." },
      { source: "Zoho Books", texte: "Clients → ⋯ → Exporter les clients." },
      { source: "Autre application", texte: "Tout export CSV ou Excel avec une colonne de noms ; le reste s'associe à l'écran suivant." },
    ],
    champs: [
      { cle: "prenom", libelle: "Prénom", alias: ["first name", "prenom", "firstname", "given name"] },
      { cle: "nom", libelle: "Nom", obligatoire: true, alias: ["last name", "nom", "name", "full name", "contact name", "nom complet", "display name", "lastname", "nom du contact", "customer name"] },
      { cle: "entreprise", libelle: "Société", alias: ["account name", "company", "company name", "entreprise", "societe", "organisation", "organization", "nom de l entreprise", "nom de la societe"] },
      { cle: "email", libelle: "Email", alias: ["email", "e mail", "emailid", "email id", "courriel", "adresse email", "adresse e mail", "mail"] },
      { cle: "telephone", libelle: "Téléphone", alias: ["phone", "telephone", "tel", "numero de telephone", "work phone", "phone number", "mobile", "mobilephone", "mobile phone", "cell", "portable", "whatsapp"] },
      { cle: "fonction", libelle: "Fonction", alias: ["title", "job title", "fonction", "poste", "designation", "role"] },
      { cle: "niu", libelle: "NIU (société)", alias: ["niu", "tax id", "cf taxid", "tax number", "numero contribuable", "n contribuable"] },
      { cle: "notes", libelle: "Notes", alias: ["description", "notes", "note", "remarques", "commentaire", "commentaires", "comments"] },
      { cle: "proprietaire", libelle: "Responsable (email ou nom)", alias: ["contact owner", "owner", "proprietaire", "responsable", "assigned to", "assigne a", "account owner"] },
    ],
  },
  PRODUITS: {
    type: "PRODUITS",
    libelle: "Produits et services",
    description: "Un produit ou service par ligne. Un article déjà présent sous le même nom est ignoré. Les prix sont en francs CFA.",
    module: "PRODUITS",
    adminSeulement: false,
    conseils: [
      { source: "Zoho Books / Inventory", texte: "Articles → ⋯ → Exporter les articles." },
      { source: "Zoho CRM", texte: "Module Produits → Exporter les produits." },
      { source: "Autre application", texte: "Un CSV ou Excel avec au minimum le nom et le prix." },
    ],
    champs: [
      { cle: "nom", libelle: "Nom", obligatoire: true, alias: ["item name", "product name", "name", "nom", "produit", "designation", "article", "service name", "libelle", "nom du produit"] },
      { cle: "description", libelle: "Description", alias: ["description", "sales description", "notes", "details"] },
      { cle: "type", libelle: "Type (bien ou service)", alias: ["item type", "product type", "type", "type d article", "product category", "categorie"] },
      { cle: "prixVente", libelle: "Prix de vente", alias: ["rate", "selling price", "unit price", "prix", "prix de vente", "price", "sales price", "tarif", "prix unitaire", "sales rate"] },
      { cle: "prixAchat", libelle: "Prix d'achat", alias: ["purchase rate", "cost price", "unit cost", "prix d achat", "cout", "purchase price", "cout d achat", "cost"] },
      { cle: "stock", libelle: "Stock", alias: ["stock on hand", "quantity in stock", "qty in stock", "stock", "quantite en stock", "initial stock", "opening stock", "quantity"] },
    ],
  },
  PROJETS_TACHES: {
    type: "PROJETS_TACHES",
    libelle: "Projets et tâches",
    description: "Une tâche par ligne, rangée dans le projet indiqué (créé s'il n'existe pas). Une tâche déjà présente dans le même projet sous le même titre est ignorée.",
    module: "PROJETS",
    adminSeulement: false,
    conseils: [
      { source: "Asana", texte: "Ouvrez le projet → menu ▾ à côté du nom → Exporter / Imprimer → CSV. Un fichier par projet, ou l'export complet d'un portefeuille." },
      { source: "Zoho Projects", texte: "Tâches → Exporter au format CSV." },
      { source: "Autre application", texte: "Un CSV ou Excel avec au moins le titre de la tâche." },
    ],
    champs: [
      { cle: "titre", libelle: "Titre de la tâche", obligatoire: true, alias: ["name", "task name", "nom", "titre", "tache", "task", "title", "nom de la tache", "task title"] },
      { cle: "projet", libelle: "Projet", alias: ["projects", "project", "projet", "projets", "nom du projet", "project name", "task list", "liste"] },
      { cle: "section", libelle: "Section / colonne / statut", alias: ["section column", "section", "colonne", "board column", "status", "statut", "task status", "etat"] },
      { cle: "terminee", libelle: "Terminée (date ou oui/non)", alias: ["completed at", "completed", "terminee le", "date de fin reelle", "completed on", "terminee", "done", "termine"] },
      { cle: "assigne", libelle: "Responsable (nom)", alias: ["assignee", "assigned to", "responsable", "assigne a", "owner", "task owner", "proprietaire"] },
      { cle: "assigneEmail", libelle: "Responsable (email)", alias: ["assignee email", "email du responsable", "owner email", "email responsable"] },
      { cle: "echeance", libelle: "Échéance", alias: ["due date", "due", "echeance", "date d echeance", "date limite", "end date", "date de fin", "deadline"] },
      { cle: "debut", libelle: "Date de début", alias: ["start date", "date de debut", "start", "debut"] },
      { cle: "notes", libelle: "Notes de la tâche", alias: ["notes", "description", "task description", "details"] },
      { cle: "parent", libelle: "Tâche parente", alias: ["parent task", "parent", "tache parente", "parent id"] },
    ],
  },
  DEVIS: {
    type: "DEVIS",
    libelle: "Devis historiques",
    description:
      "Reprise de l'historique : chaque devis garde son numéro d'origine, sans génération d'écriture comptable. Plusieurs lignes portant le même numéro forment un seul devis. Le client est retrouvé par email, téléphone ou nom, ou créé s'il n'existe pas.",
    module: "FACTURATION",
    adminSeulement: true,
    conseils: [
      { source: "Zoho Books", texte: "Devis → ⋯ → Exporter les devis. Cochez « Exporter avec les lignes » pour garder le détail." },
      { source: "Zoho One / Zoho CRM", texte: "Module Devis → Exporter." },
      { source: "Autre application", texte: "Un CSV ou Excel avec numéro, client, date et montant (ou lignes détaillées)." },
    ],
    champs: [],
  },
  FACTURES: {
    type: "FACTURES",
    libelle: "Factures historiques",
    description:
      "Reprise de l'historique : chaque facture garde son numéro d'origine, ne reçoit aucune écriture comptable et ne peut jamais être supprimée. Plusieurs lignes portant le même numéro forment une seule facture. Les factures payées reçoivent un règlement « saisie manuelle ».",
    module: "FACTURATION",
    adminSeulement: true,
    conseils: [
      { source: "Zoho Books", texte: "Factures → ⋯ → Exporter les factures. Cochez « Exporter avec les lignes » pour garder le détail." },
      { source: "Zoho One / Zoho CRM", texte: "Module Factures → Exporter." },
      { source: "Autre application", texte: "Un CSV ou Excel avec numéro, client, date, échéance, statut et montant (ou lignes détaillées)." },
    ],
    champs: [],
  },
  NOTES: {
    type: "NOTES",
    libelle: "Notes personnelles",
    description: "Chaque note est ajoutée à la suite de votre bloc-notes privé, sous son titre. Une note déjà présente n'est pas ajoutée une seconde fois.",
    module: "PARAMETRES",
    adminSeulement: true,
    conseils: [
      { source: "Zoho Notebook / Zoho One", texte: "Exportez vos notes en CSV ou Excel (titre et contenu)." },
      { source: "Autre application", texte: "Un CSV ou Excel avec une colonne de contenu et, si possible, une colonne de titre." },
    ],
    champs: [
      { cle: "titre", libelle: "Titre", alias: ["title", "titre", "name", "subject", "objet", "note title", "nom"] },
      { cle: "contenu", libelle: "Contenu", obligatoire: true, alias: ["content", "contenu", "note", "notes", "body", "text", "texte", "description", "note content", "message"] },
      { cle: "date", libelle: "Date", alias: ["created time", "created at", "date", "created", "date de creation", "modified time"] },
    ],
  },
};

const CHAMPS_DOCUMENT_COMMUNS: ChampImport[] = [
  { cle: "client", libelle: "Client (nom)", obligatoire: true, alias: ["customer name", "client", "nom du client", "contact name", "customer", "billed to", "nom client", "company name", "account name"] },
  { cle: "clientEmail", libelle: "Client (email)", alias: ["customer email", "email", "emailid", "email id", "email du client", "courriel"] },
  { cle: "clientTelephone", libelle: "Client (téléphone)", alias: ["customer phone", "phone", "telephone", "mobile", "mobilephone", "telephone du client"] },
  { cle: "date", libelle: "Date d'émission", alias: ["invoice date", "estimate date", "quote date", "date", "date d emission", "date de facture", "date du devis", "created date", "issue date", "created time"] },
  { cle: "designation", libelle: "Ligne : désignation", alias: ["item name", "item desc", "description", "designation", "libelle", "product name", "item description", "produit", "article"] },
  { cle: "quantite", libelle: "Ligne : quantité", alias: ["quantity", "qty", "quantite", "qte"] },
  { cle: "prixUnitaire", libelle: "Ligne : prix unitaire", alias: ["item price", "rate", "unit price", "prix unitaire", "pu", "price", "prix", "item rate"] },
  { cle: "tauxTVA", libelle: "Taux de TVA (%)", alias: ["item tax %", "tax percentage", "tva", "taux tva", "tax rate", "taux de tva", "tax %", "item tax percentage", "tva %"] },
  { cle: "totalHT", libelle: "Total HT (si une ligne par document)", alias: ["sub total", "subtotal", "total ht", "montant ht", "hors taxes", "amount excl tax"] },
  { cle: "totalTTC", libelle: "Total TTC (si une ligne par document)", alias: ["total", "amount", "montant", "montant ttc", "total ttc", "grand total", "net a payer", "total amount"] },
];

DEFINITIONS.FACTURES.champs = [
  { cle: "numero", libelle: "Numéro de facture", obligatoire: true, alias: ["invoice number", "invoice", "numero", "numero de facture", "n facture", "number", "reference", "invoice no", "facture"] },
  ...CHAMPS_DOCUMENT_COMMUNS,
  { cle: "echeance", libelle: "Date d'échéance", alias: ["due date", "date d echeance", "echeance", "payment due date", "date limite de paiement"] },
  { cle: "statut", libelle: "Statut", alias: ["invoice status", "status", "statut", "etat", "statut de la facture"] },
  { cle: "montantPaye", libelle: "Montant déjà payé", alias: ["amount paid", "paid amount", "montant paye", "payment made", "paye", "deja paye"] },
  { cle: "datePaiement", libelle: "Date du paiement", alias: ["payment date", "date de paiement", "paid on", "paye le", "last payment date"] },
];

DEFINITIONS.DEVIS.champs = [
  { cle: "numero", libelle: "Numéro de devis", obligatoire: true, alias: ["estimate number", "quote number", "quote", "estimate", "numero", "numero de devis", "n devis", "number", "reference", "devis"] },
  ...CHAMPS_DOCUMENT_COMMUNS,
  { cle: "echeance", libelle: "Date de validité", alias: ["expiry date", "valid until", "date de validite", "validite", "expiration date", "valable jusqu au", "due date"] },
  { cle: "statut", libelle: "Statut", alias: ["estimate status", "quote status", "status", "statut", "etat", "statut du devis"] },
];

/** Associe automatiquement chaque champ à l'en-tête qui porte un de ses noms connus (jamais deux champs sur la même colonne). */
export function proposerCorrespondance(entetes: string[], champs: ChampImport[]): Record<string, string> {
  const parNormalise = new Map<string, string>();
  for (const e of entetes) if (!parNormalise.has(normaliser(e))) parNormalise.set(normaliser(e), e);
  const utilises = new Set<string>();
  const correspondance: Record<string, string> = {};
  for (const champ of champs) {
    for (const alias of champ.alias) {
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
