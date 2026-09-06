import {
  pgTable,
  pgEnum,
  pgPolicy,
  text,
  timestamp,
  json,
  boolean,
  integer,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// Palier 0 — voir docs/palier-0-roles-permissions-specification-technique.md
//
// Chaque table métier portant entrepriseId reçoit une politique RLS
// "isolation_entreprise" : une session authentifiée (avecEntreprise() a
// positionné app.entreprise_id) ne voit et ne modifie jamais que les lignes
// de sa propre entreprise — current_setting(..., true) renvoie NULL plutôt
// que d'échouer quand la variable n'est pas positionnée. Voir section 6 et
// CLAUDE.md. La table "invitation" a en plus une politique de lecture
// permissive pour le seul cas anonyme légitime : accepterInvitation()
// recherche une ligne par jeton avant qu'une session n'existe.

export const roleSysteme = pgEnum("role_systeme", ["ADMIN", "MANAGER", "EMPLOYE", "CLIENT"]);
export const statutUtilisateur = pgEnum("statut_utilisateur", ["ACTIF", "INVITE", "DESACTIVE"]);
export const statutDomaineEmail = pgEnum("statut_domaine_email", [
  "SOUS_DOMAINE_VERTEX", // contact@nomentreprise.vertexone.app — actif immédiatement
  "EN_ATTENTE_DNS", // domaine propre saisi, en attente de vérification
  "VERIFIE", // domaine propre actif
]);

// Palier 1 — voir docs/palier-1-crm-facturation-specification-technique.md
export const statutProspect = pgEnum("statut_prospect", ["NOUVEAU", "QUALIFIE", "PROPOSITION", "GAGNE", "PERDU"]);
export const statutDevis = pgEnum("statut_devis", ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"]);
export const statutFacture = pgEnum("statut_facture", [
  "EMISE",
  "PARTIELLEMENT_PAYEE",
  "PAYEE",
  "EN_RETARD",
  "ANNULEE",
]);
export const moyenPaiement = pgEnum("moyen_paiement", [
  "orange_money",
  "mtn_momo",
  "especes",
  "virement",
  "manuel",
]);
export const typeModeleEmail = pgEnum("type_modele_email", ["ENVOI_DEVIS", "ENVOI_FACTURE"]);

export const entreprise = pgTable("entreprise", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  nom: text("nom").notNull(),
  secteurProfil: text("secteur_profil").notNull(), // "agence" | "artisan" | "cabinet" | "generique"
  planAbonnement: text("plan_abonnement").notNull().default("starter"), // starter | pro | business
  statutAbonnement: text("statut_abonnement").notNull().default("essai"), // essai | actif | suspendu
  creeLe: timestamp("cree_le").notNull().defaultNow(),
  // Palier 1 — mentions légales obligatoires avant le premier devis (voir
  // docs/palier-1-*, section 2). niu/rccm/adresse restent nullable ici :
  // c'est le contrôle applicatif (bloquer la création d'un devis) qui rend
  // le NIU obligatoire en pratique, pas une contrainte NOT NULL — une
  // entreprise doit pouvoir exister (inscription, invitations...) avant
  // d'avoir renseigné ses informations fiscales.
  niu: text("niu"),
  rccm: text("rccm"),
  adresse: text("adresse"),
  ville: text("ville"),
  assujettiTVA: boolean("assujetti_tva").notNull().default(true),
  // Compteurs de numérotation séquentielle — incrémentés atomiquement par
  // une seule requête UPDATE ... RETURNING, jamais lus puis réécrits en deux
  // temps côté application (voir docs/palier-1-*, section 5, et
  // src/lib/facturation/numerotation.ts).
  compteurFactures: integer("compteur_factures").notNull().default(0),
  compteurDevis: integer("compteur_devis").notNull().default(0),
  // Les tables des paliers suivants (Projets, Documents, RH...) portent
  // toutes une colonne entrepriseId — jamais de table sans cette clé (voir CLAUDE.md).
});

export const utilisateur = pgTable(
  "utilisateur",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    email: text("email").notNull(),
    // Pas de motDePasseHash ici : Better-Auth stocke le mot de passe (haché
    // scrypt, son algorithme par défaut) dans sa propre table "account"
    // (providerId "credential"), liée à cet utilisateur — jamais sur cette table.
    nomComplet: text("nom_complet").notNull(),
    // emailVerifie/image/misAJourLe : champs "core" requis par le modèle
    // User de Better-Auth (voir @better-auth/core/dist/db/schema/user.d.mts),
    // mappés depuis auth.ts (user.fields) sur ces colonnes françaises.
    emailVerifie: boolean("email_verifie").notNull().default(false),
    image: text("image"),
    role: roleSysteme("role").notNull().default("EMPLOYE"),
    statut: statutUtilisateur("statut").notNull().default("ACTIF"),
    managerId: text("manager_id"), // auto-référence vers utilisateur.id — portée "EQUIPE"
    creeLe: timestamp("cree_le").notNull().defaultNow(),
    misAJourLe: timestamp("mis_a_jour_le").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("utilisateur_entreprise_email_unique").on(table.entrepriseId, table.email),
    index("utilisateur_entreprise_idx").on(table.entrepriseId),
    // Permissive et non stricte : Better-Auth lit/écrit cette table avant
    // qu'une session (donc un app.entreprise_id) n'existe — voir CLAUDE.md,
    // "Le cas particulier des tables d'authentification". La RLS stricte
    // protège les tables métier (invitation, domaineEmail, dossierRH...),
    // pas celle-ci.
    pgPolicy("permissif_better_auth", { for: "all", using: sql`true`, withCheck: sql`true` }),
  ]
).enableRLS();

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    email: text("email").notNull(),
    roleProposee: roleSysteme("role_proposee").notNull(),
    // Renseignés seulement pour un rôle interne (pas CLIENT) — repris tels quels pour
    // créer automatiquement la fiche employé à l'activation du compte (Palier 5).
    postePropose: text("poste_propose"),
    typeContratPropose: text("type_contrat_propose"), // "CDI" | "CDD" | "STAGE" | "PRESTATAIRE"
    dateEmbauchePropose: timestamp("date_embauche_propose"), // saisie humaine, jamais déduite
    jeton: text("jeton").notNull().unique(),
    expireLe: timestamp("expire_le").notNull(),
    utiliseeLe: timestamp("utilisee_le"),
  },
  (table) => [
    index("invitation_entreprise_idx").on(table.entrepriseId),
    // Lecture : permissive quand aucune session n'est active (recherche
    // anonyme par jeton dans accepterInvitation) ; sinon strictement limitée
    // à l'entreprise de la session — jamais les deux à la fois.
    pgPolicy("isolation_entreprise_lecture", {
      for: "select",
      // nullif(..., '') IS NULL plutôt que IS NULL seul : sur une connexion
      // Neon fraîche (via le pooler), current_setting(..., true) renvoie une
      // chaîne vide, pas SQL NULL — confirmé par test réel (le lien
      // d'invitation était introuvable en anonyme malgré une policy qui
      // semblait correcte sur le papier). Voir CLAUDE.md.
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL`,
    }),
    // Écriture : toujours stricte, y compris pour la mise à jour qui marque
    // une invitation "utilisée" — cette opération s'exécute dans
    // avecEntreprise(invitation.entrepriseId, ...), jamais anonymement.
    pgPolicy("isolation_entreprise_ecriture", {
      for: "insert",
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
    pgPolicy("isolation_entreprise_modification", {
      for: "update",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
    pgPolicy("isolation_entreprise_suppression", {
      for: "delete",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Tables internes Better-Auth (session, compte, vérification) — champs
// gardés aux noms natifs Better-Auth (anglais) pour éviter tout mapping
// "fields" superflu (source d'erreurs, voir CLAUDE.md) ; seule la table
// "user" est unifiée avec notre modèle métier "utilisateur" ci-dessus.
// Schéma de référence : @better-auth/core/dist/db/schema/{session,account,verification}.d.mts
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    userId: text("user_id")
      .notNull()
      .references(() => utilisateur.id),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("session_user_idx").on(table.userId),
    pgPolicy("permissif_better_auth", { for: "all", using: sql`true`, withCheck: sql`true` }),
  ]
).enableRLS();

export const compte = pgTable(
  "account",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => utilisateur.id),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // haché scrypt par Better-Auth — jamais sur "utilisateur"
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    pgPolicy("permissif_better_auth", { for: "all", using: sql`true`, withCheck: sql`true` }),
  ]
).enableRLS();

export const verification = pgTable("verification", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Stub minimal — le module RH complet (congés, présence, salaire...) est le
// Palier 5, pas encore construit. Cette table existe déjà car le Palier 0
// (section 8) exige la création automatique d'une fiche employé pour tout
// rôle interne dès l'activation du compte, avec la date d'embauche réelle
// saisie à l'invitation — jamais une date système. Champs volontairement
// limités à ce que la section 8 utilise ; le reste viendra avec le Palier 5.
export const dossierRH = pgTable(
  "dossier_rh",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    utilisateurId: text("utilisateur_id")
      .notNull()
      .unique()
      .references(() => utilisateur.id),
    poste: text("poste").notNull(),
    typeContrat: text("type_contrat").notNull(), // "CDI" | "CDD" | "STAGE" | "PRESTATAIRE"
    dateEmbauche: timestamp("date_embauche").notNull(),
    // Palier 5 — voir docs/palier-5-ressources-humaines-specification-technique.md.
    dateFinContrat: timestamp("date_fin_contrat"), // pour un CDD
    // Jamais rempli automatiquement (CLAUDE.md, règles métier) — saisi par un
    // Administrateur au moment qui lui convient. FCFA entier, comme toute
    // somme d'argent de ce projet (pas de Decimal, voir CLAUDE.md).
    salaireBase: integer("salaire_base"),
    nombrePersonnesACharge: integer("nombre_personnes_a_charge").notNull().default(0),
    soldeConges: numeric("solde_conges", { precision: 5, scale: 1, mode: "number" }).notNull().default(0),
  },
  (table) => [
    index("dossier_rh_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Boîte mail professionnelle provisionnée pour l'entreprise cliente — voir
// docs/palier-0-roles-permissions-specification-technique.md, section 8bis.
export const domaineEmail = pgTable(
  "domaine_email",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    domaine: text("domaine").notNull().unique(), // "nomentreprise.vertexone.app" ou "sonentreprise.com"
    statut: statutDomaineEmail("statut").notNull().default("SOUS_DOMAINE_VERTEX"),
    enregistrementsDns: json("enregistrements_dns"), // MX/SPF/DKIM/DMARC renvoyés par Migadu
    verifieLe: timestamp("verifie_le"),
  },
  (table) => [
    index("domaine_email_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// ---------------------------------------------------------------------------
// Palier 1 — CRM, Devis & Facturation. Voir docs/palier-1-*.
//
// Écart volontaire par rapport au schéma Prisma illustratif du document :
// ligne_devis, ligne_facture, paiement et avoir_facture portent aussi
// entrepriseId, alors que le document ne le montre que sur les tables
// "parentes" (Prospect, Devis, Facture). Sans cette colonne, leur policy RLS
// devrait faire un sous-select vers la table parente pour vérifier le
// tenant — plus lent, plus fragile. Une colonne dupliquée + comparaison
// directe reste la version la plus simple à auditer, et respecte la règle
// CLAUDE.md "toute nouvelle table porte un entrepriseId, sans exception".
//
// Montants stockés en entier (francs CFA) plutôt qu'en numeric flottant : le
// FCFA n'a pas de subdivision décimale utilisée en pratique, donc pas de
// centimes à représenter — évite tout risque d'arrondi sur l'argent lui-même.
// quantite et tauxTVA restent numeric (quantités fractionnaires possibles,
// taux à deux décimales).

export const prospect = pgTable(
  "prospect",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    societeCliente: text("societe_cliente"),
    niu: text("niu"), // NIU du client — nécessaire dès qu'on facture une entreprise (B2B)
    telephone: text("telephone").notNull(), // numéro WhatsApp en priorité
    email: text("email"),
    statut: statutProspect("statut").notNull().default("NOUVEAU"),
    notes: text("notes"),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("prospect_entreprise_idx").on(table.entrepriseId),
    index("prospect_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const interaction = pgTable(
  "interaction",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospect.id),
    type: text("type").notNull(), // "appel" | "whatsapp" | "email" | "rendez-vous" | "note"
    contenu: text("contenu").notNull(),
    auteurId: text("auteur_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("interaction_entreprise_idx").on(table.entrepriseId),
    index("interaction_prospect_idx").on(table.prospectId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const devis = pgTable(
  "devis",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(), // "DEV-2026-000042" — généré à l'émission, jamais avant
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospect.id),
    statut: statutDevis("statut").notNull().default("BROUILLON"),
    dateValidite: timestamp("date_validite").notNull(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull(),
    montantTTC: integer("montant_ttc").notNull(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("devis_entreprise_numero_unique").on(table.entrepriseId, table.numero),
    index("devis_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneDevis = pgTable(
  "ligne_devis",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    devisId: text("devis_id")
      .notNull()
      .references(() => devis.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_devis_entreprise_idx").on(table.entrepriseId),
    index("ligne_devis_devis_idx").on(table.devisId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const facture = pgTable(
  "facture",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(), // "FAC-2026-000042" — séquentiel, sans trou (section 5)
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospect.id),
    devisOrigineId: text("devis_origine_id").references(() => devis.id),
    statut: statutFacture("statut").notNull().default("EMISE"),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull(),
    montantTTC: integer("montant_ttc").notNull(),
    dateEmission: timestamp("date_emission").notNull().defaultNow(),
    dateEcheance: timestamp("date_echeance").notNull(),
  },
  (table) => [
    uniqueIndex("facture_entreprise_numero_unique").on(table.entrepriseId, table.numero),
    index("facture_entreprise_idx").on(table.entrepriseId),
    index("facture_statut_idx").on(table.statut),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneFacture = pgTable(
  "ligne_facture",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureId: text("facture_id")
      .notNull()
      .references(() => facture.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_facture_entreprise_idx").on(table.entrepriseId),
    index("ligne_facture_facture_idx").on(table.factureId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const paiement = pgTable(
  "paiement",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureId: text("facture_id")
      .notNull()
      .references(() => facture.id),
    montant: integer("montant").notNull(),
    moyenPaiement: moyenPaiement("moyen_paiement").notNull(),
    referenceTransaction: text("reference_transaction"), // renvoyée par NotchPay — absente en saisie manuelle
    saisiParId: text("saisi_par_id").references(() => utilisateur.id), // traçabilité d'un pointage manuel
    datePaiement: timestamp("date_paiement").notNull().defaultNow(),
    // Rapprochement bancaire (Palier 4, section 4) — renseigné quand ce
    // paiement a été confirmé comme correspondant à une ligne d'un relevé
    // bancaire importé, voir src/lib/comptabilite/rapprochement.ts.
    rapprocheLe: timestamp("rapproche_le"),
  },
  (table) => [
    index("paiement_entreprise_idx").on(table.entrepriseId),
    index("paiement_facture_idx").on(table.factureId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Une facture n'est jamais supprimée, quel que soit le rôle (règle posée au
// Palier 0) — une annulation crée cette trace à la place.
export const avoirFacture = pgTable(
  "avoir_facture",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureId: text("facture_id")
      .notNull()
      .unique()
      .references(() => facture.id),
    motif: text("motif").notNull(),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("avoir_facture_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Palier 2 — voir docs/palier-2-projets-dossiers-specification-technique.md
// Dossier (permanent, un par client) et Projet (borné dans le temps,
// plusieurs par dossier) sont deux entités distinctes — voir section 1 du
// document : un client fidèle qui recommande garde le même Dossier et
// n'accumule que de nouveaux Projets.
export const statutDossier = pgEnum("statut_dossier", ["ACTIF", "ARCHIVE"]);
export const statutProjet = pgEnum("statut_projet", ["A_FAIRE", "EN_COURS", "EN_REVISION", "TERMINE", "ANNULE"]);
export const statutTache = pgEnum("statut_tache", ["A_FAIRE", "EN_COURS", "TERMINEE"]);

export const dossier = pgTable(
  "dossier",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospect.id),
    titre: text("titre").notNull(),
    statut: statutDossier("statut").notNull().default("ACTIF"),
    responsableId: text("responsable_id")
      .notNull()
      .references(() => utilisateur.id),
    dateOuverture: timestamp("date_ouverture").notNull().defaultNow(),
    // Palier 3, section 9 — loi camerounaise de protection des données
    // personnelles (déjà en vigueur, période de transition achevée le
    // 23/06/2026) : consentement explicite requis avant tout stockage de
    // pièce sensible (PIECE_IDENTITE/DONNEES_SANTE). Nullable : l'absence de
    // valeur signale "consentement non recueilli", affichée à l'utilisateur
    // plutôt que bloquante (le produit ne se substitue pas à la diligence
    // du client).
    consentementDonneesLe: timestamp("consentement_donnees_le"),
  },
  (table) => [
    uniqueIndex("dossier_entreprise_prospect_unique").on(table.entrepriseId, table.prospectId),
    index("dossier_entreprise_idx").on(table.entrepriseId),
    index("dossier_responsable_idx").on(table.responsableId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// entrepriseId dénormalisé ici (déductible de dossier.entrepriseId) — choix
// délibéré du document source (section 2, note) pour que la politique RLS
// et les filtres de portée s'appliquent directement, sans remonter au
// Dossier parent dans chaque requête.
export const projet = pgTable(
  "projet",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossier.id),
    titre: text("titre").notNull(),
    description: text("description"),
    statut: statutProjet("statut").notNull().default("A_FAIRE"),
    devisOrigineId: text("devis_origine_id").references(() => devis.id),
    responsablePrincipalId: text("responsable_principal_id")
      .notNull()
      .references(() => utilisateur.id),
    dateDebut: timestamp("date_debut"),
    dateEcheance: timestamp("date_echeance"),
    // Échappatoire volontaire (Palier 0, section Creator) — pas de forme
    // imposée, jamais lu par une contrainte métier du produit lui-même.
    champsPersonnalises: json("champs_personnalises"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("projet_entreprise_idx").on(table.entrepriseId),
    index("projet_dossier_idx").on(table.dossierId),
    index("projet_responsable_idx").on(table.responsablePrincipalId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// entrepriseId ajouté ici alors que le sketch initial du document ne le
// prévoyait que via projet.entrepriseId — même raisonnement que
// ligneDevis/ligneFacture au Palier 1 (voir CLAUDE.md, "sans exception") :
// une politique RLS directe sur la table plutôt qu'une sous-requête vers le
// Projet parent à chaque lecture/écriture.
export const tache = pgTable(
  "tache",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    projetId: text("projet_id")
      .notNull()
      .references(() => projet.id),
    titre: text("titre").notNull(),
    statut: statutTache("statut").notNull().default("A_FAIRE"),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    echeance: timestamp("echeance"),
    ordre: integer("ordre").notNull().default(0),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
    // Renseignée automatiquement au passage à TERMINEE — sert de base au
    // suivi d'équipe du Palier 5, jamais saisie manuellement.
    termineeLe: timestamp("terminee_le"),
  },
  (table) => [
    index("tache_entreprise_idx").on(table.entrepriseId),
    index("tache_projet_idx").on(table.projetId),
    index("tache_assigne_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Rattaché soit à un Dossier (historique de la relation client dans son
// ensemble), soit à un Projet précis, jamais aux deux à la fois — contrôle
// fait à la couche action (src/lib/actions/dossier.ts /projet.ts), pas par
// une contrainte SQL, cohérent avec le reste du produit qui ne valide pas
// ce genre de règle en base. entrepriseId ajouté pour la même raison que
// tache ci-dessus.
export const commentaire = pgTable(
  "commentaire",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierId: text("dossier_id").references(() => dossier.id),
    projetId: text("projet_id").references(() => projet.id),
    auteurId: text("auteur_id")
      .notNull()
      .references(() => utilisateur.id),
    contenu: text("contenu").notNull(),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("commentaire_entreprise_idx").on(table.entrepriseId),
    index("commentaire_dossier_idx").on(table.dossierId),
    index("commentaire_projet_idx").on(table.projetId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Modèle de message personnalisable pour l'envoi de devis/factures par
// email — un modèle par type et par entreprise. Si absent (entreprise qui
// n'a jamais personnalisé), l'envoi utilise un modèle par défaut codé dans
// src/lib/email/modeles.ts plutôt que d'exiger une configuration préalable.
export const modeleEmail = pgTable(
  "modele_email",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    type: typeModeleEmail("type").notNull(),
    objet: text("objet").notNull(),
    corps: text("corps").notNull(),
  },
  (table) => [
    uniqueIndex("modele_email_entreprise_type_unique").on(table.entrepriseId, table.type),
    index("modele_email_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Palier 3 — voir docs/palier-3-collaboration-interne-specification-technique.md
// La messagerie ne stocke pas les messages ici (délégué à un prestataire de
// chat externe, ex. Stream Chat — voir src/lib/chat/client.ts) : cette
// table ne conserve que la correspondance entre un Projet et le canal créé
// chez ce prestataire.
export const typeCanal = pgEnum("type_canal", ["PROJET", "EQUIPE", "LIBRE"]);
export const categorieDocument = pgEnum("categorie_document", [
  "GENERAL",
  "PIECE_IDENTITE",
  "DONNEES_SANTE",
  "AUTRE_SENSIBLE",
]);

export const canal = pgTable(
  "canal",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    type: typeCanal("type").notNull(),
    projetId: text("projet_id").references(() => projet.id),
    // Préfixé par entrepriseId (section 3) — jamais le seul rempart contre
    // une fuite entre entreprises côté prestataire, mais la seule
    // protection possible puisque le prestataire ne connaît pas nos
    // entreprises. Unique : un canal externe ne correspond jamais qu'à une
    // seule ligne ici.
    idFournisseurChat: text("id_fournisseur_chat").notNull().unique(),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("canal_entreprise_idx").on(table.entrepriseId),
    index("canal_projet_idx").on(table.projetId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Rattaché soit à un Dossier, soit à un Projet, jamais aux deux (même
// principe que Commentaire au Palier 2, contrôlé à la couche action, pas en
// base — voir docs/palier-2-*, section 9 "écarts réels").
export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierId: text("dossier_id").references(() => dossier.id),
    projetId: text("projet_id").references(() => projet.id),
    categorie: categorieDocument("categorie").notNull().default("GENERAL"),
    nom: text("nom").notNull(),
    // Chemin de l'objet dans Cloudflare R2 — voir src/lib/documents/stockage.ts.
    cleStockage: text("cle_stockage").notNull(),
    typeMime: text("type_mime").notNull(),
    tailleOctets: integer("taille_octets").notNull(),
    televerseParId: text("televerse_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("document_entreprise_idx").on(table.entrepriseId),
    index("document_dossier_idx").on(table.dossierId),
    index("document_projet_idx").on(table.projetId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Traçabilité des consultations de documents sensibles — exigée par la loi
// camerounaise de protection des données personnelles (voir docs/palier-3-*,
// section 9). entrepriseId ajouté (absent du sketch initial, qui ne portait
// que documentId) — même raisonnement que Tache/Commentaire au Palier 2 :
// une politique RLS directe plutôt qu'une sous-requête vers Document à
// chaque lecture, et surtout : ce journal doit rester lisible même si le
// Document sensible auquel il se réfère est un jour réellement effacé
// (droit à l'effacement, section 9) — une FK vers document sans ON DELETE
// CASCADE empêcherait justement cet effacement réel.
export const journalAccesDocument = pgTable(
  "journal_acces_document",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    documentId: text("document_id").notNull(),
    utilisateurId: text("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id),
    action: text("action").notNull(), // "consultation" | "telechargement" | "suppression"
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("journal_acces_document_entreprise_idx").on(table.entrepriseId),
    index("journal_acces_document_document_idx").on(table.documentId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const annonce = pgTable(
  "annonce",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    auteurId: text("auteur_id")
      .notNull()
      .references(() => utilisateur.id),
    contenu: text("contenu").notNull(),
    epinglee: boolean("epinglee").notNull().default(false),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("annonce_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Palier 4 — voir docs/palier-4-signature-contrats-comptabilite-specification-technique.md
export const typeSignature = pgEnum("type_signature", ["SIMPLE", "CERTIFIEE"]);
export const statutSignature = pgEnum("statut_signature", ["EN_ATTENTE", "SIGNE", "REFUSE", "EXPIRE"]);
export const statutContrat = pgEnum("statut_contrat", ["ACTIF", "EXPIRE", "RESILIE"]);

export const demandeSignature = pgTable(
  "demande_signature",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id),
    type: typeSignature("type").notNull().default("SIMPLE"),
    statut: statutSignature("statut").notNull().default("EN_ATTENTE"),
    // SHA-256 du PDF au moment de l'envoi — preuve qu'il n'a pas été modifié
    // depuis (docs/palier-4-*, section 2). Calculée une fois, jamais recalculée
    // après coup : une différence à la vérification prouverait une altération.
    empreinteDocument: text("empreinte_document").notNull(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("demande_signature_entreprise_idx").on(table.entrepriseId),
    index("demande_signature_document_idx").on(table.documentId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// entrepriseId ajouté (absent du sketch initial, qui ne portait que
// demandeSignatureId) — même raisonnement que les tables similaires des
// Paliers 2/3 : une politique RLS directe plutôt qu'une sous-requête vers
// DemandeSignature à chaque lecture. jetonAcces : lien unique à durée
// limitée envoyé au signataire, qui n'est pas forcément un Utilisateur du
// système (client final) — pas de FK vers utilisateur.
export const signataire = pgTable(
  "signataire",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    demandeSignatureId: text("demande_signature_id")
      .notNull()
      .references(() => demandeSignature.id),
    nom: text("nom").notNull(),
    telephone: text("telephone").notNull(),
    email: text("email"),
    statut: statutSignature("statut").notNull().default("EN_ATTENTE"),
    // Journal d'audit qui donne sa valeur probatoire à la signature simple
    // (docs/palier-4-*, section 2) — chaque champ ci-dessous est une pièce du
    // faisceau de preuves, jamais un simple clic isolé.
    codeVerificationEnvoye: boolean("code_verification_envoye").notNull().default(false),
    codeVerificationHash: text("code_verification_hash"), // haché, jamais le code en clair
    signeLe: timestamp("signe_le"),
    adresseIP: text("adresse_ip"),
    navigateurUtilisateur: text("navigateur_utilisateur"),
    consentementExplicite: boolean("consentement_explicite").notNull().default(false),
    jetonAcces: text("jeton_acces").notNull().unique(),
    referenceCertificatANTIC: text("reference_certificat_antic"), // uniquement si type CERTIFIEE
  },
  (table) => [
    index("signataire_entreprise_idx").on(table.entrepriseId),
    index("signataire_demande_idx").on(table.demandeSignatureId),
    // Lecture permissive quand aucune session n'est active — le signataire
    // accède à sa page de signature via jetonAcces, avant toute session
    // (même modèle que "invitation" au Palier 0). Écriture toujours stricte.
    pgPolicy("isolation_entreprise_lecture", {
      for: "select",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL`,
    }),
    pgPolicy("isolation_entreprise_ecriture", {
      for: "insert",
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
    pgPolicy("isolation_entreprise_modification", {
      for: "update",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR nullif(current_setting('app.entreprise_id', true), '') IS NULL`,
    }),
    pgPolicy("isolation_entreprise_suppression", {
      for: "delete",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Extension du Document (Palier 3), pas un produit séparé — docs/palier-4-*,
// section 3.
export const contrat = pgTable(
  "contrat",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossier.id),
    demandeSignatureId: text("demande_signature_id").references(() => demandeSignature.id),
    titre: text("titre").notNull(),
    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin"),
    renouvellementAuto: boolean("renouvellement_auto").notNull().default(false),
    preavisJours: integer("preavis_jours").notNull().default(30),
    statut: statutContrat("statut").notNull().default("ACTIF"),
    // Évite de renvoyer l'alerte d'échéance chaque jour une fois qu'elle a
    // déjà été envoyée une fois pour ce contrat — voir
    // src/lib/contrats/echeances.ts.
    alerteEcheanceEnvoyeeLe: timestamp("alerte_echeance_envoyee_le"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("contrat_entreprise_idx").on(table.entrepriseId),
    index("contrat_dossier_idx").on(table.dossierId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Plan comptable SYSCOHADA — RÉFÉRENTIEL GLOBAL partagé par toutes les
// entreprises, pas une donnée propre à une entreprise cliente (docs/palier-4-*,
// section 4 : "à importer comme données de référence depuis la nomenclature
// officielle"). C'est pourquoi cette table échappe délibérément à la règle
// "toute table porte entrepriseId" (CLAUDE.md) : la nomenclature SYSCOHADA
// est identique pour toutes les entreprises camerounaises, en lecture seule
// pour l'application — comme un enum étendu, jamais une donnée à isoler.
export const compteComptable = pgTable("compte_comptable", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  numero: text("numero").notNull().unique(), // ex: "411000" (Clients), "706000" (Prestations)
  libelle: text("libelle").notNull(),
  classe: integer("classe").notNull(), // 1 à 8, classification SYSCOHADA
});

export const ecritureComptable = pgTable(
  "ecriture_comptable",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dateEcriture: timestamp("date_ecriture").notNull(),
    libelle: text("libelle").notNull(),
    compteId: text("compte_id")
      .notNull()
      .references(() => compteComptable.id),
    debit: integer("debit").notNull().default(0), // FCFA entier, comme montantHT/TTC au Palier 1
    credit: integer("credit").notNull().default(0),
    // Traçabilité : quelle facture/quel paiement a généré cette ligne —
    // jamais de FK stricte (une facture n'est jamais supprimée de toute
    // façon, mais l'écriture doit rester lisible même si ce lien venait à
    // manquer un jour).
    factureId: text("facture_id"),
    paiementId: text("paiement_id"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("ecriture_comptable_entreprise_idx").on(table.entrepriseId),
    index("ecriture_comptable_compte_idx").on(table.compteId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Palier 5 — voir docs/palier-5-ressources-humaines-specification-technique.md
export const typeConge = pgEnum("type_conge", ["CONGE_PAYE", "MALADIE", "SANS_SOLDE", "AUTRE"]);
export const statutDemandeConge = pgEnum("statut_demande_conge", ["EN_ATTENTE", "APPROUVEE", "REFUSEE"]);
export const statutPointage = pgEnum("statut_pointage", ["PRESENT", "ABSENT", "RETARD", "CONGE"]);

// entrepriseId ajouté (absent du sketch initial, qui ne portait que
// dossierRHId) — même raisonnement que Contrat/EcritureComptable au Palier 4 :
// une politique RLS directe plutôt qu'une sous-requête vers DossierRH à
// chaque lecture.
export const demandeConge = pgTable(
  "demande_conge",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierRHId: text("dossier_rh_id")
      .notNull()
      .references(() => dossierRH.id),
    type: typeConge("type").notNull(),
    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin").notNull(),
    nombreJours: numeric("nombre_jours", { precision: 5, scale: 1, mode: "number" }).notNull(),
    statut: statutDemandeConge("statut").notNull().default("EN_ATTENTE"),
    approuveParId: text("approuve_par_id").references(() => utilisateur.id),
    // Donnée de santé au sens de la loi camerounaise de protection des
    // données personnelles quand type = MALADIE (docs/palier-5-*, section 7)
    // — même restriction de champ que le salaire, voir src/lib/rh/acces.ts.
    motif: text("motif"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("demande_conge_entreprise_idx").on(table.entrepriseId),
    index("demande_conge_dossier_rh_idx").on(table.dossierRHId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const pointage = pgTable(
  "pointage",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierRHId: text("dossier_rh_id")
      .notNull()
      .references(() => dossierRH.id),
    date: timestamp("date").notNull(), // horodatage à minuit, une ligne par jour — voir uniqueIndex ci-dessous
    heureArrivee: timestamp("heure_arrivee"),
    heureDepart: timestamp("heure_depart"),
    statut: statutPointage("statut").notNull().default("PRESENT"),
  },
  (table) => [
    index("pointage_entreprise_idx").on(table.entrepriseId),
    uniqueIndex("pointage_dossier_rh_date_unique").on(table.dossierRHId, table.date),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const evaluation = pgTable(
  "evaluation",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dossierRHId: text("dossier_rh_id")
      .notNull()
      .references(() => dossierRH.id),
    evaluateurId: text("evaluateur_id")
      .notNull()
      .references(() => utilisateur.id),
    periode: text("periode").notNull(), // ex: "2026-S1" — texte libre, pas une notation structurée (docs/palier-5-*, section 9)
    commentaire: text("commentaire"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("evaluation_entreprise_idx").on(table.entrepriseId),
    index("evaluation_dossier_rh_idx").on(table.dossierRHId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Palier 6 — voir docs/palier-6-marketing-communication-specification-technique.md.
// Construit ici : Campagnes (section 2), automatisations de relance (même
// section, ajoutées à la tâche planifiée existante), Page d'atterrissage
// (section 3), lien de visioconférence (section 4, aucune table dédiée —
// voir src/lib/marketing/visio.ts). Volontairement NON construits, comme le
// document lui-même le recommande explicitement : la facturation
// d'abonnements récurrents (section 5, "à ne construire que si un client
// pilote a explicitement ce profil d'activité") et Social (section 6, "à ne
// pas construire... sauf demande explicite et concrète d'un client").
export const canalCampagne = pgEnum("canal_campagne", ["EMAIL", "WHATSAPP"]);
export const statutCampagne = pgEnum("statut_campagne", ["BROUILLON", "ENVOYEE"]);

export const campagne = pgTable(
  "campagne",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    canal: canalCampagne("canal").notNull(),
    contenu: text("contenu").notNull(),
    // Critère simple volontairement non structuré en colonnes dédiées — voir
    // docs/palier-6-*, section 2 : "pas un constructeur de requêtes complexe
    // façon Creator". Résolu par src/lib/marketing/segments.ts.
    segment: json("segment").notNull().$type<{ statut?: string; sansProjetDepuisJours?: number }>(),
    statut: statutCampagne("statut").notNull().default("BROUILLON"),
    envoyeeLe: timestamp("envoyee_le"),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("campagne_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Lecture publique quand publiee = true, même sans session active — la page
// /p/[slug] (docs/palier-6-*, section 3) est servie à des visiteurs anonymes,
// jamais connectés. Contrairement à invitation/signataire, la permissivité
// ne dépend pas seulement de l'absence de session : une page non publiée
// reste invisible même sans session (brouillon en cours d'édition).
export const pageAtterrissage = pgTable(
  "page_atterrissage",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    slug: text("slug").notNull().unique(),
    titre: text("titre").notNull(),
    texte: text("texte").notNull(),
    imageUrl: text("image_url"),
    texteBouton: text("texte_bouton").notNull().default("Nous contacter"),
    publiee: boolean("publiee").notNull().default(false),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("page_atterrissage_entreprise_idx").on(table.entrepriseId),
    pgPolicy("lecture_publique_ou_entreprise", {
      for: "select",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR (${table.publiee} = true AND nullif(current_setting('app.entreprise_id', true), '') IS NULL)`,
    }),
    pgPolicy("ecriture_entreprise", {
      for: "insert",
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
    pgPolicy("modification_entreprise", {
      for: "update",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
    pgPolicy("suppression_entreprise", {
      for: "delete",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Verrouillage à la carte, indépendant du forfait (docs/palier-6-*, section
// 5) — voir disponibleAddon() dans src/lib/plans.ts. Réservé pour l'instant
// à l'addon "MARKETING" (Campagnes/automatisations/Page d'atterrissage,
// docs/strategie-*, section 7 : "Modules complémentaires... en options à
// l'unité") ; la Facturation d'abonnements récurrents elle-même n'est pas
// construite dans cette session (voir commentaire plus haut), mais la table
// est prête à accueillir son addon le jour où elle le sera.
export const addonActif = pgTable(
  "addon_actif",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    addon: text("addon").notNull(), // "MARKETING", et d'autres à l'avenir
    prixMensuel: integer("prix_mensuel").notNull(),
    activeLe: timestamp("active_le").notNull().defaultNow(),
  },
  (table) => [
    index("addon_actif_entreprise_idx").on(table.entrepriseId),
    uniqueIndex("addon_actif_entreprise_addon_unique").on(table.entrepriseId, table.addon),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();
