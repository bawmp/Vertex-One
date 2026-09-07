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
  // Cycle Achats (échange du 2026-09-07) — un Bon de commande fournisseur
  // n'est pas un document fiscal (pas de contrainte légale de séquence sans
  // trou), mais réutilise le même mécanisme atomique éprouvé que
  // Devis/Facture plutôt que d'en inventer un nouveau.
  compteurBonsCommandeAchat: integer("compteur_bons_commande_achat").notNull().default(0),
  // Extensions Ventes (échange du 2026-09-07) — Bon de commande client
  // (Sales Order), série distincte du Bon de commande fournisseur ci-dessus.
  compteurBonsCommandeVente: integer("compteur_bons_commande_vente").notNull().default(0),
  // Reçus de vente (échange du 2026-09-07) — série distincte, jamais mêlée à
  // la numérotation des Factures.
  compteurRecusVente: integer("compteur_recus_vente").notNull().default(0),
  // Factures d'acompte (échange du 2026-09-07) — série distincte, jamais
  // mêlée à la numérotation des Factures.
  compteurFacturesAcompte: integer("compteur_factures_acompte").notNull().default(0),
  // Journaux manuels (échange du 2026-09-07) — pas un document fiscal
  // (comme les Bons de commande), mais une référence stable utile pour
  // retrouver une écriture manuelle dans le Journal des écritures.
  compteurJournauxManuels: integer("compteur_journaux_manuels").notNull().default(0),
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

// Reconstruction Leads/Contacts/Comptes/Deals sur le modèle de Zoho CRM
// (échange du 2026-09-06), en remplacement complet de l'ancien Prospect
// unique — aucune vraie donnée cliente n'existait encore, migration directe
// plutôt que double système transitoire. Quatre entités reliées :
//   Lead        — prospect non qualifié, avant tout travail commercial réel.
//   Contact     — la personne, ancrage permanent (ce que Dossier référence),
//                 créée à la conversion d'un Lead.
//   Compte      — la société optionnelle (cas B2B) qui regroupe des Contacts.
//   Deal        — l'opportunité commerciale avec un montant et une étape de
//                 pipeline ; c'est elle que Devis/Facture référencent, pas
//                 directement le Contact (un Contact peut avoir plusieurs
//                 Deals au fil du temps, exactement comme chez Zoho).
export const statutLead = pgEnum("statut_lead", ["NOUVEAU", "CONTACTE", "QUALIFIE", "DISQUALIFIE"]);
export const statutDeal = pgEnum("statut_deal", ["QUALIFICATION", "PROPOSITION", "NEGOCIATION", "GAGNE", "PERDU"]);

export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    societeCliente: text("societe_cliente"),
    telephone: text("telephone").notNull(), // numéro WhatsApp en priorité
    email: text("email"),
    statut: statutLead("statut").notNull().default("NOUVEAU"),
    notes: text("notes"),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    // Renseignés à la conversion (convertirLead()) — jamais modifiés après,
    // trace de ce que ce Lead est devenu plutôt qu'une ligne supprimée.
    convertiLe: timestamp("converti_le"),
    contactConvertiId: text("contact_converti_id"),
    dealConvertiId: text("deal_converti_id"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("lead_entreprise_idx").on(table.entrepriseId),
    index("lead_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Nommée compteClient (pas "compte") pour éviter toute collision avec la
// table Better-Auth "compte" (identifiants de connexion, voir plus haut
// dans ce fichier) — deux concepts homonymes en français mais totalement
// distincts : celui-ci est le "Account" (société) au sens Zoho CRM.
export const compteClient = pgTable(
  "compte_client",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    niu: text("niu"), // NIU de la société — nécessaire dès qu'on la facture (B2B)
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("compte_client_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    compteId: text("compte_id").references(() => compteClient.id), // nullable — un client particulier n'a pas de Compte
    nom: text("nom").notNull(),
    telephone: text("telephone").notNull(),
    email: text("email"),
    fonction: text("fonction"), // ex: "Directeur achats" — utile seulement si compteId est renseigné
    notes: text("notes"),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("contact_entreprise_idx").on(table.entrepriseId),
    index("contact_compte_idx").on(table.compteId),
    index("contact_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const deal = pgTable(
  "deal",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    titre: text("titre").notNull(),
    montant: integer("montant").notNull().default(0), // FCFA entier, voir CLAUDE.md
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    // Dénormalisé depuis contact.compteId — évite une jointure supplémentaire
    // pour afficher "Compte" dans chaque ligne de liste (comme Zoho affiche
    // Account Name directement sur la liste des Deals), tenu à jour à la
    // création uniquement : un Deal ne change pas de compte après coup.
    compteId: text("compte_id").references(() => compteClient.id),
    statut: statutDeal("statut").notNull().default("QUALIFICATION"),
    dateClotureEstimee: timestamp("date_cloture_estimee"),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("deal_entreprise_idx").on(table.entrepriseId),
    index("deal_contact_idx").on(table.contactId),
    index("deal_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Timeline du pipeline (inspirée du timeline de Deal dans Zoho CRM) —
// remplace historiqueStatutProspect, maintenant attachée au Deal plutôt
// qu'au Contact : c'est le Deal qui porte une étape de pipeline.
export const historiqueStatutDeal = pgTable(
  "historique_statut_deal",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    dealId: text("deal_id")
      .notNull()
      .references(() => deal.id),
    ancienStatut: statutDeal("ancien_statut"), // NULL à la création du deal
    nouveauStatut: statutDeal("nouveau_statut").notNull(),
    modifieParId: text("modifie_par_id")
      .notNull()
      .references(() => utilisateur.id),
    modifieLe: timestamp("modifie_le").notNull().defaultNow(),
  },
  (table) => [
    index("historique_statut_deal_entreprise_idx").on(table.entrepriseId),
    index("historique_statut_deal_deal_idx").on(table.dealId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const statutTacheCrm = pgEnum("statut_tache_crm", ["NON_COMMENCEE", "EN_COURS", "TERMINEE", "DIFFEREE"]);
export const prioriteTacheCrm = pgEnum("priorite_tache_crm", ["BASSE", "NORMALE", "HAUTE"]);

// Activités CRM (inspirées de l'Accueil de Zoho CRM, échange du 2026-09-06)
// — distinctes de `tache` (Palier 2, rattachée à un Projet) : celles-ci se
// rattachent à un Lead, un Contact ou un Deal, jamais à un Projet. "Relatif
// à" (leadId/contactId/dealId) reste nullable et non exclusif entre eux à la
// base — même principe que dossierId/projetId sur `commentaire` — le
// contact et le deal/lead peuvent tous les deux être renseignés (le contact
// d'un deal précis, par exemple).
export const tacheCrm = pgTable(
  "tache_crm",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    objet: text("objet").notNull(),
    statut: statutTacheCrm("statut").notNull().default("NON_COMMENCEE"),
    priorite: prioriteTacheCrm("priorite").notNull().default("NORMALE"),
    dateEcheance: timestamp("date_echeance"),
    leadId: text("lead_id").references(() => lead.id),
    contactId: text("contact_id").references(() => contact.id),
    dealId: text("deal_id").references(() => deal.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
    termineeLe: timestamp("terminee_le"),
  },
  (table) => [
    index("tache_crm_entreprise_idx").on(table.entrepriseId),
    index("tache_crm_assigne_idx").on(table.assigneAId),
    index("tache_crm_lead_idx").on(table.leadId),
    index("tache_crm_contact_idx").on(table.contactId),
    index("tache_crm_deal_idx").on(table.dealId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const reunionCrm = pgTable(
  "reunion_crm",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    titre: text("titre").notNull(),
    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin").notNull(),
    leadId: text("lead_id").references(() => lead.id),
    contactId: text("contact_id").references(() => contact.id),
    dealId: text("deal_id").references(() => deal.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("reunion_crm_entreprise_idx").on(table.entrepriseId),
    index("reunion_crm_assigne_idx").on(table.assigneAId),
    index("reunion_crm_lead_idx").on(table.leadId),
    index("reunion_crm_contact_idx").on(table.contactId),
    index("reunion_crm_deal_idx").on(table.dealId),
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
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    type: text("type").notNull(), // "appel" | "whatsapp" | "email" | "rendez-vous" | "note"
    contenu: text("contenu").notNull(),
    auteurId: text("auteur_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("interaction_entreprise_idx").on(table.entrepriseId),
    index("interaction_contact_idx").on(table.contactId),
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
    // Découplage Books/CRM (échange du 2026-09-07) — dealId optionnel
    // (renseigné seulement quand ce document vient réellement du pipeline
    // CRM) ; contactId/assigneAId sont la seule source de vérité du client,
    // voir src/lib/facturation/client-document.ts.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    // Dénormalisé depuis contact.compteId, jamais saisi — même patron que
    // deal.compteId.
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
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
    index("devis_contact_idx").on(table.contactId),
    index("devis_assigne_a_idx").on(table.assigneAId),
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
    // Nullable — une ligne de Devis peut rester en texte libre, comme
    // avant le catalogue Produits (échange du 2026-09-07). Voir produit.
    produitId: text("produit_id").references(() => produit.id),
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
    // Découplage Books/CRM (échange du 2026-09-07) — voir devis.dealId/
    // contactId ci-dessus pour le raisonnement complet.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    devisOrigineId: text("devis_origine_id").references(() => devis.id),
    // Renseigné quand cette Facture a été générée automatiquement par le
    // worker de facturation récurrente plutôt que saisie/acceptée à la main
    // (échange du 2026-09-07, voir genererFacturesRecurrentesDues()) —
    // référence en avant vers une table définie plus bas dans ce fichier,
    // sûr avec drizzle-orm car .references() prend un callback évalué
    // paresseusement, jamais au chargement du module.
    factureRecurrenteId: text("facture_recurrente_id").references(() => factureRecurrente.id),
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
    index("facture_contact_idx").on(table.contactId),
    index("facture_assigne_a_idx").on(table.assigneAId),
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
    // Copié depuis ligne_devis à l'acceptation — permet le mouvement de
    // stock (échange du 2026-09-07, voir accepterDevis()).
    produitId: text("produit_id").references(() => produit.id),
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

// Extensions Ventes (échange du 2026-09-07) — Bon de commande client (Sales
// Order) : chemin alternatif additif au Devis existant, pas une étape
// obligatoire imposée entre Devis et Facture (le pont Devis → Facture déjà
// construit, accepterDevis(), reste inchangé). NOTRE numéro
// (genererNumeroBonCommandeVente), aucune écriture comptable ni mouvement de
// stock à la création (engagement, pas encore une vente réalisée — miroir
// exact du Bon de commande fournisseur côté Achats).
export const statutBonCommandeVente = pgEnum("statut_bon_commande_vente", ["BROUILLON", "FACTURE", "ANNULE"]);

export const bonCommandeVente = pgTable(
  "bon_commande_vente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    // Découplage Books/CRM (échange du 2026-09-07) — voir devis.dealId/contactId.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    statut: statutBonCommandeVente("statut").notNull().default("BROUILLON"),
    dateCommande: timestamp("date_commande").notNull().defaultNow(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0),
    montantTTC: integer("montant_ttc").notNull(),
    // Renseigné à la conversion en Facture — jamais réutilisé pour une
    // deuxième conversion (voir convertirBonCommandeVenteEnFacture()).
    factureId: text("facture_id").references(() => facture.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("bon_commande_vente_entreprise_idx").on(table.entrepriseId),
    index("bon_commande_vente_deal_idx").on(table.dealId),
    index("bon_commande_vente_contact_idx").on(table.contactId),
    index("bon_commande_vente_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneBonCommandeVente = pgTable(
  "ligne_bon_commande_vente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    bonCommandeVenteId: text("bon_commande_vente_id")
      .notNull()
      .references(() => bonCommandeVente.id),
    produitId: text("produit_id").references(() => produit.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_bon_commande_vente_entreprise_idx").on(table.entrepriseId),
    index("ligne_bon_commande_vente_bcv_idx").on(table.bonCommandeVenteId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const frequenceFactureRecurrente = pgEnum("frequence_facture_recurrente", ["MENSUEL", "TRIMESTRIEL", "ANNUEL"]);
export const statutFactureRecurrente = pgEnum("statut_facture_recurrente", ["ACTIF", "EN_PAUSE", "TERMINE"]);

/**
 * Extensions Ventes (échange du 2026-09-07) — un modèle de facturation
 * récurrente (Recurring Invoice chez Zoho Books) : un profil sans numéro
 * propre (ce n'est pas un document financier, seulement un générateur), qui
 * produit une vraie Facture numérotée (genererNumeroFacture(), même série
 * que toute autre facture) à chaque échéance atteinte. Le worker
 * (verifier-factures-recurrentes, cron quotidien) avance
 * prochaineDateGeneration et bascule le statut à TERMINE une fois dateFin
 * dépassée — voir src/lib/facturation/recurrence.ts.
 */
export const factureRecurrente = pgTable(
  "facture_recurrente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    // Découplage Books/CRM (échange du 2026-09-07) — voir devis.dealId/contactId.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    libelle: text("libelle").notNull(),
    frequence: frequenceFactureRecurrente("frequence").notNull(),
    statut: statutFactureRecurrente("statut").notNull().default("ACTIF"),
    dateDebut: timestamp("date_debut").notNull(),
    dateFin: timestamp("date_fin"),
    prochaineDateGeneration: timestamp("prochaine_date_generation").notNull(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0),
    montantTTC: integer("montant_ttc").notNull(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("facture_recurrente_entreprise_idx").on(table.entrepriseId),
    index("facture_recurrente_deal_idx").on(table.dealId),
    index("facture_recurrente_prochaine_generation_idx").on(table.prochaineDateGeneration),
    index("facture_recurrente_contact_idx").on(table.contactId),
    index("facture_recurrente_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneFactureRecurrente = pgTable(
  "ligne_facture_recurrente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureRecurrenteId: text("facture_recurrente_id")
      .notNull()
      .references(() => factureRecurrente.id),
    produitId: text("produit_id").references(() => produit.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_facture_recurrente_entreprise_idx").on(table.entrepriseId),
    index("ligne_facture_recurrente_fr_idx").on(table.factureRecurrenteId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const statutRecuVente = pgEnum("statut_recu_vente", ["EMISE", "ANNULE"]);

/**
 * Extensions Ventes, Reçus de vente (Sales Receipts, échange du 2026-09-07)
 * — une vente encaissée intégralement et immédiatement (Mobile Money,
 * espèces...), qui ne passe jamais par le compte Clients (411000) ni par le
 * cycle Facture/Paiement : contrairement à accepterDevis()/
 * convertirBonCommandeVenteEnFacture(), voir genererEcrituresRecuVente() qui
 * débite directement la trésorerie. Numérotation propre (genererNumeroRecuVente(),
 * préfixe "REC"), jamais mêlée à la série des Factures.
 */
export const recuVente = pgTable(
  "recu_vente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    // Découplage Books/CRM (échange du 2026-09-07) — voir devis.dealId/contactId.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    statut: statutRecuVente("statut").notNull().default("EMISE"),
    dateEmission: timestamp("date_emission").notNull().defaultNow(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0),
    montantTTC: integer("montant_ttc").notNull(),
    moyenPaiement: moyenPaiement("moyen_paiement").notNull(),
    referenceTransaction: text("reference_transaction"), // renvoyée par NotchPay — absente en saisie manuelle, comme paiement.referenceTransaction
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recu_vente_entreprise_numero_unique").on(table.entrepriseId, table.numero),
    index("recu_vente_entreprise_idx").on(table.entrepriseId),
    index("recu_vente_deal_idx").on(table.dealId),
    index("recu_vente_contact_idx").on(table.contactId),
    index("recu_vente_assigne_a_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneRecuVente = pgTable(
  "ligne_recu_vente",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    recuVenteId: text("recu_vente_id")
      .notNull()
      .references(() => recuVente.id),
    produitId: text("produit_id").references(() => produit.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_recu_vente_entreprise_idx").on(table.entrepriseId),
    index("ligne_recu_vente_rv_idx").on(table.recuVenteId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const statutFactureAcompte = pgEnum("statut_facture_acompte", ["EMISE", "PAYEE", "APPLIQUEE", "ANNULEE"]);

/**
 * Extensions Ventes, Factures d'acompte (Retainer Invoices, échange du
 * 2026-09-07) — une avance demandée avant livraison. Pas de lignes ni de
 * TVA (une avance n'est jamais du chiffre d'affaires tant qu'elle n'est pas
 * appliquée sur une vraie Facture, qui porte sa propre ventilation HT/TVA) :
 * juste un montant. Cycle de vie : EMISE (créée, rien n'a encore été
 * encaissé) → PAYEE (encaissée, comptabilisée comme une dette envers le
 * client sur 419100, montantRestant = montant) → APPLIQUEE (montantRestant
 * tombé à zéro, appliquée en une ou plusieurs fois) ; ANNULEE uniquement
 * depuis EMISE (voir annulerFactureAcompte() — une fois encaissée, annuler
 * nécessiterait un remboursement, hors périmètre). Simplification connue,
 * cohérente avec le reste du module : une application ne couvre qu'une
 * Facture DONT le montant TTC est intégralement couvert par
 * montantRestant (pas de paiement partiel d'une Facture, déjà non
 * implémenté ailleurs dans ce produit) — voir
 * src/lib/actions/facture-acompte.ts.
 */
export const factureAcompte = pgTable(
  "facture_acompte",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    // Découplage Books/CRM (échange du 2026-09-07) — voir devis.dealId/contactId.
    dealId: text("deal_id").references(() => deal.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    compteId: text("compte_id").references(() => compteClient.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    statut: statutFactureAcompte("statut").notNull().default("EMISE"),
    dateEmission: timestamp("date_emission").notNull().defaultNow(),
    montant: integer("montant").notNull(),
    // Significatif seulement à partir de PAYEE (initialisé à `montant` dès la
    // création pour simplifier le schéma, mais ignoré tant que le statut
    // reste EMISE).
    montantRestant: integer("montant_restant").notNull(),
    moyenPaiement: moyenPaiement("moyen_paiement"), // renseigné seulement à l'encaissement
    referenceTransaction: text("reference_transaction"),
    dateEncaissement: timestamp("date_encaissement"),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("facture_acompte_entreprise_numero_unique").on(table.entrepriseId, table.numero),
    index("facture_acompte_entreprise_idx").on(table.entrepriseId),
    index("facture_acompte_deal_idx").on(table.dealId),
    index("facture_acompte_contact_idx").on(table.contactId),
    index("facture_acompte_assigne_a_idx").on(table.assigneAId),
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
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
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
    uniqueIndex("dossier_entreprise_contact_unique").on(table.entrepriseId, table.contactId),
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
    // Suivi des heures (échange du 2026-09-07) — pré-remplit le formulaire
    // d'une nouvelle entrée de temps, jamais imposé : chaque entrée garde son
    // propre tauxHoraire, modifiable au cas par cas.
    tauxHoraireParDefaut: integer("taux_horaire_par_defaut"),
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

/**
 * Suivi des heures (Time Tracking, échange du 2026-09-07) — une entrée de
 * temps enregistrée par un utilisateur sur un Projet, éventuellement une
 * Tâche précise. `facturable`/`tauxHoraire` déterminent si et comment elle
 * alimente une Facture (voir genererFactureDepuisHeures(),
 * src/lib/actions/entree-temps.ts) : jamais du chiffre d'affaires tant
 * qu'elle n'a pas été effectivement facturée (`factureId` renseigné à ce
 * moment, jamais réutilisable pour une deuxième facture — même patron que
 * bonCommandeVente.factureId). Comme Projet, aucun `contactId` propre : le
 * client facturable se retrouve via `projet.dossierId → dossier.contactId`.
 * Module de permission réutilisé : "PROJETS" (comme Tache), pas de nouveau
 * module dédié.
 */
export const entreeTemps = pgTable(
  "entree_temps",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    projetId: text("projet_id")
      .notNull()
      .references(() => projet.id),
    tacheId: text("tache_id").references(() => tache.id),
    utilisateurId: text("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id),
    date: timestamp("date").notNull(),
    dureeHeures: numeric("duree_heures", { precision: 5, scale: 2, mode: "number" }).notNull(),
    facturable: boolean("facturable").notNull().default(true),
    tauxHoraire: integer("taux_horaire").notNull().default(0), // FCFA/heure, 0 si non facturable ou taux non renseigné
    note: text("note"),
    factureId: text("facture_id").references(() => facture.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("entree_temps_entreprise_idx").on(table.entrepriseId),
    index("entree_temps_projet_idx").on(table.projetId),
    index("entree_temps_utilisateur_idx").on(table.utilisateurId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

/**
 * Minuteur démarrer/arrêter (échange du 2026-09-07, comparaison avec la
 * feuille de temps Zoho Books) — une ligne = un minuteur EN COURS pour un
 * utilisateur, supprimée dès l'arrêt (qui crée alors la véritable ligne
 * `entreeTemps` correspondante, voir arreterMinuteur(),
 * src/lib/actions/minuteur.ts) ou l'annulation (suppression sans création).
 * `uniqueIndex` sur `utilisateurId` : un seul minuteur actif par
 * utilisateur, contrainte posée en base (pas seulement vérifiée en
 * application) contre une course concurrente sur un double démarrage.
 */
export const minuteurActif = pgTable(
  "minuteur_actif",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    utilisateurId: text("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id),
    projetId: text("projet_id")
      .notNull()
      .references(() => projet.id),
    tacheId: text("tache_id").references(() => tache.id),
    demarreLe: timestamp("demarre_le").notNull().defaultNow(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("minuteur_actif_utilisateur_unique").on(table.utilisateurId),
    index("minuteur_actif_entreprise_idx").on(table.entrepriseId),
    index("minuteur_actif_projet_idx").on(table.projetId),
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
    // Ajouté pour le cycle Achats (échange du 2026-09-06/07) — même
    // raisonnement que factureId/paiementId ci-dessus : jamais de FK stricte.
    depenseId: text("depense_id"),
    factureFournisseurId: text("facture_fournisseur_id"),
    paiementEffectueId: text("paiement_effectue_id"),
    // Reçus de vente (échange du 2026-09-07) — même raisonnement, jamais de FK stricte.
    recuVenteId: text("recu_vente_id"),
    // Factures d'acompte (échange du 2026-09-07) — même raisonnement, jamais
    // de FK stricte. Une écriture d'application porte à la fois
    // factureAcompteId et factureId, les deux documents étant réellement
    // liés par ce mouvement (voir genererEcrituresApplicationAcompte()).
    factureAcompteId: text("facture_acompte_id"),
    // Journaux manuels (échange du 2026-09-07) — même raisonnement, jamais de
    // FK stricte : une ligne saisie à la main via creerJournalManuel()
    // (src/lib/actions/journal-manuel.ts), regroupée avec les autres lignes
    // du même journalManuel par cet id, jamais réutilisable pour tracer une
    // origine différente.
    journalManuelId: text("journal_manuel_id"),
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

/**
 * Journal manuel (Zoho Books > Comptable > "Journaux manuels", échange du
 * 2026-09-07) — une écriture comptable saisie à la main (correction,
 * ajustement de fin de mois), jamais générée automatiquement par une
 * Facture/Dépense/Paiement (voir src/lib/comptabilite/ecritures.ts pour ces
 * cas-là). Une ligne ici = un journal ; ses lignes de débit/crédit vivent
 * dans `ecritureComptable` (journalManuelId), pas dupliquées ici — cette
 * table ne porte que l'en-tête (numéro, libellé, date, auteur).
 */
export const journalManuel = pgTable(
  "journal_manuel",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    libelle: text("libelle").notNull(),
    dateEcriture: timestamp("date_ecriture").notNull(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("journal_manuel_entreprise_numero_unique").on(table.entrepriseId, table.numero),
    index("journal_manuel_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Documents financiers (inspiré du module "Documents" de Zoho Books,
// échange du 2026-09-06) — distinct de `document` (Palier 3, rattaché à un
// Dossier/Projet, avec classification de sensibilité PIECE_IDENTITE/
// DONNEES_SANTE) : ceux-ci sont des pièces comptables (reçus, factures
// fournisseurs, relevés bancaires) rattachées à une Facture ou un Paiement,
// sans notion de sensibilité. `classeurId` NULL signifie "Boîte de
// réception" (pas encore classé), comme l'Inbox de Zoho Books. Pas
// d'autoscan/OCR ni de forwarding email automatique ici (nécessiteraient un
// fournisseur externe non configuré, voir docs/crm-roadmap-post-
// commercialisation.md) — fournisseurOuVendeur/montant/dateDocument sont
// saisis manuellement, à la place de l'extraction automatique.
export const classeurDocumentFinancier = pgTable(
  "classeur_document_financier",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("classeur_document_financier_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const documentFinancier = pgTable(
  "document_financier",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    // Chemin de l'objet dans Cloudflare R2 — voir src/lib/documents/stockage.ts
    // (helper déjà générique, réutilisé tel quel).
    cleStockage: text("cle_stockage").notNull(),
    typeMime: text("type_mime").notNull(),
    tailleOctets: integer("taille_octets").notNull(),
    classeurId: text("classeur_id").references(() => classeurDocumentFinancier.id),
    factureId: text("facture_id").references(() => facture.id),
    paiementId: text("paiement_id").references(() => paiement.id),
    fournisseurOuVendeur: text("fournisseur_ou_vendeur"),
    montant: integer("montant"), // FCFA entier, voir CLAUDE.md
    dateDocument: timestamp("date_document"),
    televerseParId: text("televerse_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("document_financier_entreprise_idx").on(table.entrepriseId),
    index("document_financier_classeur_idx").on(table.classeurId),
    index("document_financier_facture_idx").on(table.factureId),
    index("document_financier_paiement_idx").on(table.paiementId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Cycle Achats (inspiré de Zoho Books, échange du 2026-09-06 — spécification
// complète "zoho-books-full-spec.md") — miroir du cycle Ventes côté
// fournisseurs. Cette première tranche couvre Fournisseurs + Dépenses (la
// transaction d'achat la plus simple, "hors cycle bill complet" selon la
// doc) ; Bons de commande, Factures fournisseurs, Paiements effectués et
// Avoirs fournisseurs suivent dans une tranche séparée (voir
// docs/crm-roadmap-post-commercialisation.md).
export const fournisseur = pgTable(
  "fournisseur",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    nom: text("nom").notNull(),
    niu: text("niu"), // NIU du fournisseur — utile pour la déductibilité TVA
    telephone: text("telephone").notNull(),
    email: text("email"),
    adresse: text("adresse"),
    notes: text("notes"),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("fournisseur_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Saisie rapide d'une dépense — génère systématiquement ses écritures
// comptables (charge + TVA récupérable au débit, trésorerie au crédit),
// même principe que Facture/Paiement au Palier 4
// (src/lib/comptabilite/ecritures.ts). Jamais supprimée une fois créée,
// comme Facture (voir CLAUDE.md) — seule la correction par une nouvelle
// écriture serait envisageable, pas construite ici.
export const depense = pgTable(
  "depense",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    libelle: text("libelle").notNull(),
    compteComptableId: text("compte_comptable_id")
      .notNull()
      .references(() => compteComptable.id), // catégorie de charge (classe 6 du plan SYSCOHADA)
    fournisseurId: text("fournisseur_id").references(() => fournisseur.id),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0), // TVA récupérable, 0 si non applicable
    montantTTC: integer("montant_ttc").notNull(),
    moyenPaiement: moyenPaiement("moyen_paiement").notNull(),
    // Refacturable à un client (Deal) — "Billable Expense" chez Zoho.
    // Stocké pour ne rien perdre, mais pas encore repris automatiquement
    // dans une ligne de Devis/Facture (voir docs/crm-roadmap-post-
    // commercialisation.md).
    refacturable: boolean("refacturable").notNull().default(false),
    dealId: text("deal_id").references(() => deal.id),
    datePaiement: timestamp("date_paiement").notNull(),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("depense_entreprise_idx").on(table.entrepriseId),
    index("depense_assigne_idx").on(table.assigneAId),
    index("depense_fournisseur_idx").on(table.fournisseurId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Cycle Achats, deuxième tranche (échange du 2026-09-07) — Facture
// fournisseur (Bill) : contrairement à Dépense, suppose une dette avec
// échéance, pas un paiement immédiat. "numero" est le numéro DU FOURNISSEUR
// (texte libre saisi par l'utilisateur), jamais généré par nous — à
// l'inverse de Facture (client), où le numéro est LE NÔTRE et soumis à une
// numérotation atomique sans trou (voir CLAUDE.md). Une seule catégorie de
// charge par facture (compteComptableId), comme Dépense — pas de compte par
// ligne, faute de catalogue Produits/Tarifs (voir docs/crm-roadmap-post-
// commercialisation.md).
export const statutFactureFournisseur = pgEnum("statut_facture_fournisseur", ["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "PAYEE", "ANNULEE"]);

export const factureFournisseur = pgTable(
  "facture_fournisseur",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    fournisseurId: text("fournisseur_id")
      .notNull()
      .references(() => fournisseur.id),
    compteComptableId: text("compte_comptable_id")
      .notNull()
      .references(() => compteComptable.id),
    statut: statutFactureFournisseur("statut").notNull().default("EN_ATTENTE"),
    dateFacture: timestamp("date_facture").notNull(),
    dateEcheance: timestamp("date_echeance").notNull(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0),
    montantTTC: integer("montant_ttc").notNull(),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("facture_fournisseur_entreprise_idx").on(table.entrepriseId),
    index("facture_fournisseur_fournisseur_idx").on(table.fournisseurId),
    index("facture_fournisseur_assigne_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneFactureFournisseur = pgTable(
  "ligne_facture_fournisseur",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureFournisseurId: text("facture_fournisseur_id")
      .notNull()
      .references(() => factureFournisseur.id),
    // Nullable — copié depuis ligne_bon_commande_achat à la conversion, ou
    // choisi directement à la création ; permet le mouvement de stock
    // inverse (échange du 2026-09-07, voir incrementerStockAchat()).
    produitId: text("produit_id").references(() => produit.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_facture_fournisseur_entreprise_idx").on(table.entrepriseId),
    index("ligne_facture_fournisseur_facture_idx").on(table.factureFournisseurId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Règlement d'une Facture fournisseur — miroir de `paiement` (côté client),
// toujours pour le montant total en une fois pour l'instant, même
// simplification que marquerFacturePayee() (aucun paiement partiel implémenté
// non plus côté client malgré PARTIELLEMENT_PAYEE déjà dans l'enum).
export const paiementEffectue = pgTable(
  "paiement_effectue",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureFournisseurId: text("facture_fournisseur_id")
      .notNull()
      .references(() => factureFournisseur.id),
    montant: integer("montant").notNull(),
    moyenPaiement: moyenPaiement("moyen_paiement").notNull(),
    referenceTransaction: text("reference_transaction"),
    datePaiement: timestamp("date_paiement").notNull().defaultNow(),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("paiement_effectue_entreprise_idx").on(table.entrepriseId),
    index("paiement_effectue_facture_idx").on(table.factureFournisseurId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Cycle Achats, troisième tranche (échange du 2026-09-07) — Bon de commande
// fournisseur (Purchase Order) : un engagement d'achat, pas encore une dette
// comptable — aucune écriture générée à sa création, contrairement à une
// Facture fournisseur (les commandes en cours restent hors bilan tant
// qu'elles ne sont pas facturées, comme chez Zoho Books). NOTRE numéro
// (genererNumeroBonCommandeAchat), contrairement au numéro d'une Facture
// fournisseur qui est celui du fournisseur.
export const statutBonCommandeAchat = pgEnum("statut_bon_commande_achat", ["BROUILLON", "FACTURE", "ANNULE"]);

export const bonCommandeAchat = pgTable(
  "bon_commande_achat",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    numero: text("numero").notNull(),
    fournisseurId: text("fournisseur_id")
      .notNull()
      .references(() => fournisseur.id),
    compteComptableId: text("compte_comptable_id")
      .notNull()
      .references(() => compteComptable.id),
    statut: statutBonCommandeAchat("statut").notNull().default("BROUILLON"),
    dateCommande: timestamp("date_commande").notNull().defaultNow(),
    montantHT: integer("montant_ht").notNull(),
    montantTVA: integer("montant_tva").notNull().default(0),
    montantTTC: integer("montant_ttc").notNull(),
    // Renseigné à la conversion en Facture fournisseur — jamais réutilisé
    // pour une deuxième conversion (voir convertirBonCommandeEnFacture()).
    factureFournisseurId: text("facture_fournisseur_id").references(() => factureFournisseur.id),
    assigneAId: text("assigne_a_id")
      .notNull()
      .references(() => utilisateur.id),
    creeParId: text("cree_par_id")
      .notNull()
      .references(() => utilisateur.id),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("bon_commande_achat_entreprise_idx").on(table.entrepriseId),
    index("bon_commande_achat_fournisseur_idx").on(table.fournisseurId),
    index("bon_commande_achat_assigne_idx").on(table.assigneAId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

export const ligneBonCommandeAchat = pgTable(
  "ligne_bon_commande_achat",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    bonCommandeAchatId: text("bon_commande_achat_id")
      .notNull()
      .references(() => bonCommandeAchat.id),
    // Nullable — copié vers ligne_facture_fournisseur à la conversion
    // (échange du 2026-09-07). Un Bon de commande n'affecte jamais le
    // stock lui-même (hors bilan tant que non facturé, voir schema.ts).
    produitId: text("produit_id").references(() => produit.id),
    designation: text("designation").notNull(),
    quantite: numeric("quantite", { precision: 10, scale: 2, mode: "number" }).notNull(),
    prixUnitaire: integer("prix_unitaire").notNull(),
    tauxTVA: numeric("taux_tva", { precision: 5, scale: 2, mode: "number" }).notNull().default(19.25),
  },
  (table) => [
    index("ligne_bon_commande_achat_entreprise_idx").on(table.entrepriseId),
    index("ligne_bon_commande_achat_bc_idx").on(table.bonCommandeAchatId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Avoir fournisseur (Vendor Credit) — miroir exact de avoirFacture (côté
// client) : même simplification assumée (pas de contre-passation des
// écritures d'origine, voir annulerFacture() qui ne le fait pas non plus).
export const avoirFournisseur = pgTable(
  "avoir_fournisseur",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    factureFournisseurId: text("facture_fournisseur_id")
      .notNull()
      .unique()
      .references(() => factureFournisseur.id),
    motif: text("motif").notNull(),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("avoir_fournisseur_entreprise_idx").on(table.entrepriseId),
    pgPolicy("isolation_entreprise", {
      for: "all",
      using: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
      withCheck: sql`${table.entrepriseId} = current_setting('app.entreprise_id', true)`,
    }),
  ]
).enableRLS();

// Catalogue Produits/Tarifs (Items chez Zoho Books, échange du 2026-09-07)
// — référentiel partagé Ventes/Achats : une ligne de Devis/Facture peut
// s'y rattacher (prixVente pré-rempli) comme une ligne de Bon de commande/
// Facture fournisseur (prixAchat pré-rempli), sans obligation — le texte
// libre reste toujours possible (produitId nullable sur chaque ligne).
// stockActuel n'est auto-mouvementé que pour les BIEN avec suiviStock actif
// (une vente le diminue, un achat facturé l'augmente, comme documenté dans
// zoho-books-full-spec.md section 5.3) — voir les lignes de Facture/Facture
// fournisseur pour l'intégration réelle du mouvement de stock.
export const typeProduit = pgEnum("type_produit", ["BIEN", "SERVICE"]);

export const produit = pgTable(
  "produit",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    entrepriseId: text("entreprise_id")
      .notNull()
      .references(() => entreprise.id),
    type: typeProduit("type").notNull().default("SERVICE"),
    nom: text("nom").notNull(),
    description: text("description"),
    prixVente: integer("prix_vente").notNull().default(0),
    prixAchat: integer("prix_achat").notNull().default(0),
    suiviStock: boolean("suivi_stock").notNull().default(false),
    stockActuel: integer("stock_actuel").notNull().default(0),
    creeLe: timestamp("cree_le").notNull().defaultNow(),
  },
  (table) => [
    index("produit_entreprise_idx").on(table.entrepriseId),
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
