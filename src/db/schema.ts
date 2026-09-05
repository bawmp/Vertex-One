import { pgTable, pgEnum, pgPolicy, text, timestamp, json, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
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

export const entreprise = pgTable("entreprise", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  nom: text("nom").notNull(),
  secteurProfil: text("secteur_profil").notNull(), // "agence" | "artisan" | "cabinet" | "generique"
  planAbonnement: text("plan_abonnement").notNull().default("starter"), // starter | pro | business
  statutAbonnement: text("statut_abonnement").notNull().default("essai"), // essai | actif | suspendu
  creeLe: timestamp("cree_le").notNull().defaultNow(),
  // Les tables des paliers suivants (Prospects, Factures, Projets, Documents, RH...)
  // portent toutes une colonne entrepriseId — jamais de table sans cette clé (voir CLAUDE.md).
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
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true) OR current_setting('app.entreprise_id', true) IS NULL`,
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
