# Palier 0 — Spécification technique : comptes, rôles et permissions

*Document technique complémentaire à la stratégie & roadmap — Septembre 2026*

Ce document détaille la conception concrète du socle sur lequel tous les paliers suivants (CRM, Facturation, Projets, Documents, RH...) viendront s'appuyer. L'enjeu n'est pas seulement technique : c'est la pièce la plus coûteuse à corriger après coup si elle est mal pensée dès le départ.

## 1. Le choix de conception le plus important : rôles fixes plutôt que permissions personnalisables

Deux approches sont possibles. La première est un système de permissions entièrement personnalisables où chaque entreprise cliente peut créer ses propres rôles et cocher des droits case par case — c'est ce que fait Zoho, mais c'est en réalité un mini-éditeur de permissions à construire, avec son interface, ses cas limites, et son coût de maintenance propre (le même type de piège que le module Creator identifié plus tôt : une brique qui devient un projet en soi). La seconde, retenue ici pour le Palier 0, est un nombre restreint de rôles fixes — **Administrateur, Manager, Employé, et à terme Client** — dont les droits sont définis une fois dans le code plutôt que configurables par chaque client. Cette deuxième approche couvre la quasi-totalité des besoins réels d'une TPE de services, se construit en quelques jours plutôt qu'en plusieurs semaines, et n'interdit pas d'ajouter un éditeur de permissions personnalisées plus tard comme fonctionnalité payante du palier Business si des clients plus grands le réclament explicitement — l'architecture décrite plus bas est conçue pour permettre cette évolution sans réécriture.

## 2. Les quatre rôles et leur logique

**Administrateur** — le ou les dirigeants de l'entreprise cliente. Accès total à tous les modules et à toutes les données de l'entreprise, y compris la gestion des utilisateurs, des rôles, et de l'abonnement à la plateforme.

**Manager** — responsable d'une équipe. Voit et agit sur les dossiers, prospects et projets de son équipe (les employés qui lui sont rattachés), pas sur ceux des autres équipes s'il y en a plusieurs. Ne peut pas modifier les paramètres globaux de l'entreprise ni gérer les autres comptes utilisateurs.

**Employé** — un collaborateur opérationnel. Ne voit que ce qui lui est directement assigné (ses propres prospects, ses propres tâches, ses propres dossiers) — c'est la distinction que vous avez mentionnée en premier lorsque vous avez décrit le besoin, et c'est ce rôle qui la rend concrète.

**Client** (portail restreint, à activer à partir du Palier 4 avec la signature électronique) — un accès très limité pour le client final de votre client : consulter ses propres devis/factures, signer un document. Ce rôle existe dans le modèle de données dès le Palier 0 pour éviter une migration lourde plus tard, mais son portail n'est construit qu'au Palier 4.

Chaque droit se décline aussi selon une **portée** : `TOUT` (toute l'entreprise), `EQUIPE` (l'utilisateur et les personnes qui lui sont rattachées), ou `PROPRE` (uniquement ce qui est assigné à l'utilisateur). C'est cette portée, combinée au rôle, qui détermine ce qu'une personne voit réellement à l'écran.

## 3. Modèle de données (schéma Drizzle)

```typescript
import { pgTable, pgEnum, text, timestamp, json, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const roleSysteme = pgEnum("role_systeme", ["ADMIN", "MANAGER", "EMPLOYE", "CLIENT"]);
export const statutUtilisateur = pgEnum("statut_utilisateur", ["ACTIF", "INVITE", "DESACTIVE"]);
export const statutDomaineEmail = pgEnum("statut_domaine_email", [
  "SOUS_DOMAINE_VERTEX", // contact@nomentreprise.vertexone.app — actif immédiatement
  "EN_ATTENTE_DNS",      // domaine propre saisi, en attente de vérification
  "VERIFIE",             // domaine propre actif
]);

export const entreprise = pgTable("entreprise", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  nom: text("nom").notNull(),
  secteurProfil: text("secteur_profil").notNull(), // "agence" | "artisan" | "cabinet" | "generique" — pilote le vocabulaire affiché
  planAbonnement: text("plan_abonnement").notNull().default("starter"),     // starter | pro | business
  statutAbonnement: text("statut_abonnement").notNull().default("essai"),  // essai | actif | suspendu
  creeLe: timestamp("cree_le").notNull().defaultNow(),
  // Les tables vers CRM, Factures, Projets, Documents, RH
  // seront ajoutées à chaque palier suivant, toutes avec une
  // colonne entrepriseId — jamais de table sans cette clé.
});

export const utilisateur = pgTable("utilisateur", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entrepriseId: text("entreprise_id").notNull().references(() => entreprise.id),
  email: text("email").notNull(),
  // Pas de champ mot de passe ici : Better-Auth stocke le mot de passe (haché
  // scrypt, son algorithme par défaut) dans sa propre table "account"
  // (providerId "credential"), liée à cet utilisateur par son id — jamais
  // sur cette table.
  nomComplet: text("nom_complet").notNull(),
  role: roleSysteme("role").notNull().default("EMPLOYE"),
  statut: statutUtilisateur("statut").notNull().default("ACTIF"),
  managerId: text("manager_id"), // rattachement à un manager, pour la "portée EQUIPE" — auto-référence vers utilisateur.id
  creeLe: timestamp("cree_le").notNull().defaultNow(),
}, (table) => ({
  entrepriseEmailUnique: uniqueIndex("utilisateur_entreprise_email_unique").on(table.entrepriseId, table.email),
  entrepriseIdx: index("utilisateur_entreprise_idx").on(table.entrepriseId),
}));

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entrepriseId: text("entreprise_id").notNull().references(() => entreprise.id),
  email: text("email").notNull(),
  roleProposee: roleSysteme("role_proposee").notNull(),
  // Renseignés seulement pour un rôle interne (pas CLIENT) — repris tels
  // quels pour créer automatiquement la fiche employé à l'activation du
  // compte (voir section 8 et le Palier 5). Laissés vides, des valeurs
  // par défaut raisonnables sont utilisées : rien ne bloque l'invitation.
  postePropose: text("poste_propose"),
  typeContratPropose: text("type_contrat_propose"), // "CDI" | "CDD" | "STAGE" | "PRESTATAIRE"
  dateEmbauchePropose: timestamp("date_embauche_propose"), // saisie par la personne qui crée l'invitation, jamais déduite — voir section 8
  jeton: text("jeton").notNull().unique(),
  expireLe: timestamp("expire_le").notNull(),
  utiliseeLe: timestamp("utilisee_le"),
}, (table) => ({
  entrepriseIdx: index("invitation_entreprise_idx").on(table.entrepriseId),
}));

// Boîte mail professionnelle provisionnée pour l'entreprise cliente —
// créée automatiquement à l'inscription sur un sous-domaine Vertex One,
// avec possibilité de brancher un domaine propre plus tard (section 8bis).
export const domaineEmail = pgTable("domaine_email", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  entrepriseId: text("entreprise_id").notNull().references(() => entreprise.id),
  domaine: text("domaine").notNull().unique(), // "nomentreprise.vertexone.app" ou "sonentreprise.com"
  statut: statutDomaineEmail("statut").notNull().default("SOUS_DOMAINE_VERTEX"),
  enregistrementsDns: json("enregistrements_dns"), // MX/SPF/DKIM/DMARC à afficher si domaine propre
  verifieLe: timestamp("verifie_le"),
}, (table) => ({
  entrepriseIdx: index("domaine_email_entreprise_idx").on(table.entrepriseId),
}));
```

Point d'attention : **toute nouvelle table ajoutée aux paliers suivants doit obligatoirement porter une colonne `entrepriseId`** — c'est la règle de base qui empêche une fuite de données entre deux entreprises clientes. Ce n'est pas une option laissée à l'appréciation du développeur au moment d'écrire chaque module : c'est une règle à vérifier systématiquement en revue de code (ou en revue par Claude Code) avant de considérer un module terminé.

## 4. La matrice de permissions (définie dans le code, pas éditable par le client en v1)

```typescript
type Module = "CRM" | "FACTURATION" | "PROJETS" | "DOCUMENTS" | "PARAMETRES";
type Action = "VOIR" | "CREER" | "MODIFIER" | "SUPPRIMER";
type Portee = "TOUT" | "EQUIPE" | "PROPRE";

const MATRICE_PERMISSIONS: Record<RoleSysteme, Record<Module, { actions: Action[]; portee: Portee }>> = {
  ADMIN: {
    CRM:         { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"],              portee: "TOUT" }, // pas de SUPPRIMER : voir note ci-dessous
    PROJETS:     { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    DOCUMENTS:   { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
    PARAMETRES:  { actions: ["VOIR", "CREER", "MODIFIER", "SUPPRIMER"], portee: "TOUT" },
  },
  MANAGER: {
    CRM:         { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    FACTURATION: { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PROJETS:     { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    DOCUMENTS:   { actions: ["VOIR", "CREER", "MODIFIER"], portee: "EQUIPE" },
    PARAMETRES:  { actions: [],                            portee: "PROPRE" },
  },
  EMPLOYE: {
    CRM:         { actions: ["VOIR", "CREER", "MODIFIER"], portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR", "CREER"],              portee: "PROPRE" },
    PROJETS:     { actions: ["VOIR", "MODIFIER"],           portee: "PROPRE" },
    DOCUMENTS:   { actions: ["VOIR", "CREER"],              portee: "PROPRE" },
    PARAMETRES:  { actions: [],                             portee: "PROPRE" },
  },
  CLIENT: {
    CRM:         { actions: [],       portee: "PROPRE" },
    FACTURATION: { actions: ["VOIR"], portee: "PROPRE" },
    PROJETS:     { actions: ["VOIR"], portee: "PROPRE" },
    DOCUMENTS:   { actions: ["VOIR"], portee: "PROPRE" }, // la signature est un droit à part, ajouté au Palier 4
    PARAMETRES:  { actions: [],       portee: "PROPRE" },
  },
};

export function peut(role: RoleSysteme, module: Module, action: Action): boolean {
  return MATRICE_PERMISSIONS[role][module].actions.includes(action);
}

export function portee(role: RoleSysteme, module: Module): Portee {
  return MATRICE_PERMISSIONS[role][module].portee;
}
```

Note volontaire sur la Facturation : **aucun rôle ne peut supprimer une facture, même l'Administrateur.** Une fois qu'une facture existe (et a fortiori une fois qu'elle sera validée en temps réel par la plateforme DGI dans le cadre de la facturation électronique 2026), la supprimer purement et simplement pose un problème de traçabilité comptable. La bonne pratique, à construire dès le Palier 1, est une action d'**annulation** qui laisse une trace (avoir/facture d'annulation) plutôt qu'une suppression — c'est un détail qui a l'air mineur ici mais qui évite un vrai problème de conformité une fois le produit en production.

## 5. Comment la portée s'applique concrètement (exemple avec le CRM)

La portée n'est pas qu'une donnée théorique : elle filtre réellement les requêtes à la base de données. Par exemple, pour lister les prospects visibles par un utilisateur donné :

```typescript
async function listerProspectsVisibles(utilisateur: UtilisateurConnecte) {
  const scope = portee(utilisateur.role, "CRM");

  if (scope === "TOUT") {
    return db.prospect.findMany({ where: { entrepriseId: utilisateur.entrepriseId } });
  }

  if (scope === "EQUIPE") {
    const idsEquipe = await getIdsMembresEquipe(utilisateur.id); // lui + ses employés rattachés
    return db.prospect.findMany({
      where: { entrepriseId: utilisateur.entrepriseId, assigneAId: { in: idsEquipe } },
    });
  }

  // scope === "PROPRE"
  return db.prospect.findMany({
    where: { entrepriseId: utilisateur.entrepriseId, assigneAId: utilisateur.id },
  });
}
```

Le même principe s'applique ensuite identiquement aux Projets/Dossiers du Palier 2 et à la Facturation — c'est justement parce que cette logique est centralisée dans `peut()` et `portee()` que chaque nouveau palier n'a pas à réinventer sa propre logique de droits.

## 6. Une deuxième barrière indépendante du code applicatif : l'isolation au niveau de la base de données

La vérification des droits dans le code (`peut()`, filtrage par `portee()`) est nécessaire mais repose sur le fait que le code est écrit sans erreur partout, tout le temps — un pari risqué sur la durée d'un projet qui grossit. En complément, PostgreSQL permet d'appliquer une deuxième barrière indépendante, directement dans la base : la Row-Level Security (RLS). Concrètement, chaque requête vers la base positionne d'abord l'identifiant de l'entreprise courante, puis une politique de sécurité empêche physiquement la base de renvoyer une ligne appartenant à une autre entreprise, même si une erreur de code oubliait le filtre `entrepriseId` :

```sql
ALTER TABLE "Prospect" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prospect" FORCE ROW LEVEL SECURITY; -- indispensable : sans cette
-- ligne, la policy ne s'applique pas au propriétaire de la table, précisément
-- le rôle utilisé par la connexion applicative (Neon) — voir CLAUDE.md.

CREATE POLICY isolation_entreprise ON "Prospect"
  USING ("entrepriseId" = current_setting('app.entreprise_id', true));
```

(Exemple donné ici sur une table métier générique — pas sur `Utilisateur`, voir le cas particulier ci-dessous.)

Cette politique est à répliquer sur chaque table métier ajoutée aux paliers suivants (Prospects, Factures, Projets, Documents...). C'est un peu plus de travail à la mise en place de chaque module, mais c'est la garantie la plus solide contre le scénario le plus dommageable pour la confiance de vos clients : qu'une entreprise voie, même par accident, les données d'une autre.

**Un piège précis à éliminer dès ce palier : `SET app.entreprise_id` doit s'exécuter sur la même connexion que la requête qui suit.** En environnement serverless avec des connexions Postgres poolées (Neon), positionner cette variable puis exécuter la requête comme deux appels séparés ne garantit rien : le pool peut très bien servir la deuxième requête sur une connexion différente, où la variable n'a jamais été positionnée — et la barrière RLS ne protège alors plus rien, silencieusement. La seule façon fiable est d'envelopper systématiquement les deux opérations dans la même transaction, via un helper unique que tout le code applicatif utilise, jamais une requête RLS "à la main" :

```typescript
async function avecEntreprise<T>(entrepriseId: string, fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.entreprise_id', ${entrepriseId}, true)`);
    return fn(tx);
  });
}

// Usage — jamais un appel à db.execute() ou db.select() en dehors de ce helper
// pour une table portant une politique RLS :
const prospects = await avecEntreprise(session.entrepriseId, (tx) =>
  tx.select().from(prospect).where(eq(prospect.assigneAId, session.utilisateurId))
);
```

`set_config('app.entreprise_id', valeur, true)` — pas `SET LOCAL app.entreprise_id = ${entrepriseId}` : cette dernière syntaxe échoue avec une erreur `syntax error at or near "$1"`, car la commande `SET` de Postgres n'accepte pas de paramètre lié côté protocole préparé, seulement `set_config()`, qui est un appel de fonction normal. Erreur rencontrée et corrigée en testant réellement ce helper contre une base Neon, pas seulement supposée en lisant la documentation Postgres — une bonne illustration de pourquoi l'étape 5 ci-dessous doit être exécutée pour de vrai. Le troisième argument (`true`) confine l'effet à la transaction en cours (équivalent de `LOCAL`) : il disparaît automatiquement au commit, sans risque qu'une connexion réutilisée par le pool garde par erreur l'`entrepriseId` d'une requête précédente.

**Piège de driver à ne pas rater avec Neon.** Le driver `neon-http` (HTTP, sans connexion persistante) ne supporte pas `db.transaction()` — donc pas ce mécanisme du tout. Le client Drizzle applicatif doit être créé avec `drizzle-orm/neon-serverless` (pool WebSocket) ou `node-postgres`, jamais `neon-http`, sous peine que le helper `avecEntreprise()` ci-dessus échoue silencieusement ou plante.

**Piège encore plus sournois, propre à Neon : le rôle de connexion par défaut ignore silencieusement toute la RLS.** Le rôle "owner" créé automatiquement par Neon pour chaque nouveau projet (`xxx_owner`) porte l'attribut `BYPASSRLS` — et un rôle avec cet attribut ignore purement et simplement `ENABLE`/`FORCE ROW LEVEL SECURITY`, sans la moindre erreur : les requêtes fonctionnent normalement, elles renvoient juste les données de toutes les entreprises comme si la RLS n'existait pas. Aucune revue de code ne peut détecter ce problème, seule l'exécution réelle du test de fuite (étape 5) le révèle. La correction : créer un second rôle Postgres dédié à l'application, avec `NOBYPASSRLS` explicite, ne disposant que des droits `SELECT`/`INSERT`/`UPDATE`/`DELETE` (pas de droits DDL) :

```sql
CREATE ROLE app_vertexone WITH LOGIN PASSWORD '...' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO app_vertexone;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_vertexone;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_vertexone;
```

`DATABASE_URL` (utilisé par l'application et par les tests) pointe exclusivement vers ce rôle restreint. Le rôle owner par défaut de Neon n'est plus utilisé que pour les migrations (`DATABASE_URL_MIGRATIONS`, droits DDL nécessaires pour créer/modifier les tables) — jamais par du code qui sert du trafic applicatif.

**Le cas particulier des tables d'authentification.** Better-Auth (section 8) exécute ses propres requêtes (connexion, création de session) directement via le client Drizzle applicatif, **en dehors** du wrapper `avecEntreprise()` — logique, puisqu'au moment de se connecter l'`entrepriseId` de la session n'est pas encore connu. Appliquer une politique RLS stricte sur la table `utilisateur` casserait donc la connexion elle-même. La bonne pratique : une politique RLS permissive (ou un rôle Postgres dédié sans policy) sur les tables consultées par Better-Auth (utilisateur, session, compte), et la politique RLS stricte réservée aux tables métier (Prospects, Factures, Projets...) qui ne sont jamais interrogées avant qu'une session authentifiée n'existe.

**Le même problème se pose pour `invitation`** (section 8bis) : `accepterInvitation()` recherche une ligne par jeton avant qu'une session n'existe. La politique de lecture y est donc permissive uniquement quand aucun `app.entreprise_id` n'est positionné — mais attention, sur Neon (via le pooler), une connexion "vierge" renvoie `current_setting('app.entreprise_id', true) = ''` (chaîne vide), **pas** `NULL`. Un test `... OR current_setting(...) IS NULL` ne se déclenche donc jamais, et la ligne reste invisible même en anonyme — bug réel rencontré en développement. Écrire `... OR nullif(current_setting('app.entreprise_id', true), '') IS NULL` à la place.

## 7. Exemple concret : comment Agence Kiro et Garage Mbarga restent séparées

Pour rendre tout ce qui précède tangible, prenons deux entreprises clientes fictives : **Agence Kiro** (une agence de communication à Douala) et **Garage Mbarga** (un garage automobile à Yaoundé).

**L'inscription.** Quand Agence Kiro s'inscrit, une ligne est créée dans la table `Entreprise` avec un identifiant unique généré automatiquement, par exemple `ent_kiro_7x2`. Quand Garage Mbarga s'inscrit à son tour, il reçoit le sien, `ent_mbarga_9k1`. Chaque utilisateur créé ensuite — l'administrateur, ses employés — est rattaché à l'un de ces deux identifiants via le champ `entrepriseId`, jamais aux deux à la fois.

**La création de données.** Quand un employé de Kiro ajoute un prospect dans le CRM, cette fiche porte silencieusement l'étiquette `entrepriseId: "ent_kiro_7x2"`. Quand Garage Mbarga émet une facture, elle porte `entrepriseId: "ent_mbarga_9k1"`. Les deux entreprises partagent exactement les mêmes tables dans la même base de données — c'est plus simple et moins coûteux à faire fonctionner qu'une base séparée par client — mais chaque ligne porte cette étiquette invisible qui dit à qui elle appartient.

**Le trajet complet d'une requête, de la connexion à l'affichage.**

```typescript
// 1. Un employé de Kiro se connecte. Le serveur vérifie ses identifiants
//    puis émet une session signée contenant son entrepriseId — jamais
//    une information que le navigateur pourrait modifier lui-même.
const session = { utilisateurId: "u_42", entrepriseId: "ent_kiro_7x2", role: "EMPLOYE" };

// 2. Il ouvre la page "Mes prospects". Le serveur reçoit la requête,
//    lit l'entrepriseId dans SA PROPRE session signée (pas dans l'URL,
//    pas dans un champ envoyé par le navigateur), puis :

// 2a. Positionne l'entreprise active pour la base de données —
//     c'est ce qui active la barrière indépendante (RLS, section 6).
await db.$executeRaw`SET app.entreprise_id = ${session.entrepriseId}`;

// 2b. Interroge la base avec le filtre applicatif (première barrière,
//     section 5) — jamais une requête "tous les prospects" sans filtre.
const prospects = await listerProspectsVisibles(session);
```

Un employé de Garage Mbarga qui ouvrirait la même page au même moment déclencherait exactement le même code, mais avec `entrepriseId: "ent_mbarga_9k1"` dans sa propre session — la requête ne demande alors jamais les prospects de Kiro, et même si elle le faisait par erreur de code, la base de données les refuserait grâce à la politique RLS positionnée à l'étape 2a.

**Ce qui NE fait PAS la différence entre les deux entreprises**, et c'est important de l'écarter explicitement : ni l'adresse du site, ni un champ caché dans le formulaire, ni quoi que ce soit que le navigateur envoie de son propre chef. La seule source de vérité est la session signée par le serveur au moment de la connexion, vérifiée à nouveau à chaque requête. C'est ce qui empêche un employé un peu curieux de Kiro de modifier l'adresse d'une page ou une requête réseau dans son navigateur pour tenter de voir les données de Mbarga : le serveur ne lit jamais l'identité de l'entreprise dans ce que le navigateur lui envoie, seulement dans la session qu'il a lui-même délivrée après authentification.

## 8. Flux d'authentification et d'invitation

L'authentification elle-même (session, cookies, hachage du mot de passe, CSRF, limitation du taux de connexion, réinitialisation) est déléguée à **Better-Auth**, une bibliothèque open-source auto-hébergée branchée directement sur les tables `utilisateur` ci-dessus — aucune donnée ne quitte votre base Postgres, et le modèle de rôles/portée reste entièrement le vôtre, défini dans `MATRICE_PERMISSIONS`. Ce que Better-Auth ne fait pas — décider qui voit quoi selon `role` et `portee()` — reste écrit à la main dans ce document, comme prévu.

Point de configuration à ne pas rater : Better-Auth génère par défaut ses propres tables (`user`, `session`, `account`). Il faut explicitement le configurer pour qu'il réutilise la table `utilisateur` existante (via `drizzleAdapter(db, { provider: "pg", schema: { ...schema, user: schema.utilisateur } })`) plutôt que de laisser deux modèles d'utilisateurs coexister. Les champs `entrepriseId`, `role`, `managerId`, `statut` sont déclarés en `additionalFields` de la configuration Better-Auth.

**Inscription d'une nouvelle entreprise cliente.** Un formulaire crée simultanément l'`Entreprise` et son premier `Utilisateur`, automatiquement rôle `ADMIN`. C'est ce compte qui invite ensuite les autres. Dans le même mouvement, une boîte mail professionnelle est provisionnée automatiquement sur un sous-domaine Vertex One (`contact@nomentreprise.vertexone.app`) via l'API de Migadu — voir section 8bis pour le détail et l'option de domaine propre.

**Invitation d'un collaborateur.** L'Administrateur (ou un Manager, selon la matrice) saisit l'email et le rôle proposé, et — si le rôle n'est pas `CLIENT` — le poste, le type de contrat, et **la date d'embauche réelle**, saisie à la main par la personne qui remplit l'invitation plutôt que déduite de quoi que ce soit d'automatique : c'est elle qui sait quand la personne a réellement été embauchée, surtout pour un employé déjà en poste avant même l'adoption de la plateforme. Une ligne `Invitation` est créée avec un jeton à usage unique et une expiration (72 heures, par exemple), envoyée par email (et idéalement par WhatsApp, cohérent avec le reste du produit). L'invité clique le lien, définit son mot de passe, et son compte `Utilisateur` est créé avec le rôle proposé.

**Une fiche employé est créée automatiquement à ce moment précis, pour tout rôle interne.** C'est un principe important, à ne pas traiter comme une étape administrative séparée que l'Administrateur ferait "plus tard" : dès qu'un compte `Utilisateur` autre que `CLIENT` devient `ACTIF`, son `DossierRH` (Palier 5) est créé dans le même mouvement, en reprenant telles quelles les informations saisies à l'invitation — y compris la date d'embauche renseignée par son créateur, jamais une date système.

```typescript
async function surUtilisateurActive(utilisateur: Utilisateur, invitation: Invitation) {
  await prestataireChat.creerUtilisateur({ /* ... provisionnement du Palier 3 ... */ });

  if (utilisateur.role !== "CLIENT") {
    await db.dossierRH.create({
      data: {
        entrepriseId: utilisateur.entrepriseId,
        utilisateurId: utilisateur.id,
        poste: invitation.posteProspose ?? "Non renseigné",
        typeContrat: invitation.typeContratPropose ?? "CDI",
        // La date d'embauche réelle est saisie par la personne qui a créé
        // l'invitation (Admin/Manager) — jamais la date d'activation du
        // compte, qui peut être bien postérieure à l'embauche effective
        // (le temps que l'employé reçoive et ouvre son invitation, ou pour
        // un employé déjà en poste avant l'adoption de la plateforme).
        dateEmbauche: invitation.dateEmbauchePropose ?? new Date(),
      },
    });
  }
}
```

Cette création ne dépend volontairement pas de `disponible(entreprise, "RH")` : le module RH (ses écrans, ses actions de gestion des congés, etc.) reste verrouillé au forfait Business comme prévu, mais la donnée brute existe dès le premier jour pour tout le monde, à coût nul. Un client Starter ou Pro qui monte en gamme plus tard retrouve donc l'historique réel d'embauche de chaque employé plutôt qu'une date artificielle correspondant à sa mise à niveau — c'est le même raisonnement que celui déjà appliqué à la Facturation, où l'on préfère collecter une donnée correcte dès qu'elle existe plutôt que d'attendre qu'elle devienne "utile" à l'écran.

**Connexion.** Email et mot de passe (haché avec scrypt par Better-Auth — son algorithme par défaut, résistant aux attaques GPU/ASIC — pas un algorithme plus faible), qui donne une session contenant l'identifiant utilisateur, l'identifiant entreprise, et le rôle. Chaque requête vers le serveur revérifie ces trois informations — jamais fait confiance à ce que le navigateur prétend être le rôle de l'utilisateur, uniquement à ce que la session signée par le serveur contient.

## 8bis. Boîte mail professionnelle : provisioning et domaine propre

**À l'inscription**, un appel à l'API Migadu (`POST /domains` puis `POST /domains/{name}/mailboxes`) crée `contact@nomentreprise.vertexone.app` et une ligne `domaineEmail` avec `statut: "SOUS_DOMAINE_VERTEX"` — aucune configuration DNS requise côté client, la boîte est utilisable immédiatement.

**Si l'entreprise cliente possède ou achète ensuite un domaine propre**, elle le saisit dans les paramètres. L'application appelle `GET /domains/{name}/records` (Migadu renvoie les enregistrements DNS requis — MX, SPF, DKIM, DMARC — directement en JSON), les stocke dans `enregistrementsDns`, et passe le statut à `EN_ATTENTE_DNS` :

```typescript
async function demanderDomainePropre(entrepriseId: string, domaine: string) {
  const enregistrements = await migadu.recupererEnregistrementsDns(domaine);
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(domaineEmail).values({
      entrepriseId,
      domaine,
      statut: "EN_ATTENTE_DNS",
      enregistrementsDns: enregistrements,
    })
  );
}
```

**Une tâche planifiée** (la même file adossée à Postgres que les relances de facture) interroge périodiquement `GET /domains/{name}/diagnostics` pour les domaines en attente — Migadu n'offre pas de webhook de confirmation, seul le polling est possible. Une fois la vérification confirmée, elle provisionne la boîte sur le domaine propre, passe le statut à `VERIFIE`, et notifie l'administrateur par le canal email transactionnel (Resend/Postmark) que sa boîte professionnelle est active. Tant que le statut reste `EN_ATTENTE_DNS`, l'entreprise continue d'utiliser sa boîte sur sous-domaine Vertex One sans interruption — jamais de coupure entre les deux.

Point d'isolation à ne pas oublier : chaque sous-domaine (ou domaine propre) porte ses propres enregistrements SPF/DKIM, pour qu'une réputation d'envoi dégradée chez une entreprise cliente (compte compromis, usage abusif) n'affecte jamais la délivrabilité des autres entreprises hébergées sur la même plateforme.

## 9. Ordre de construction concret pour ce palier

1. Schéma Drizzle (Entreprise, Utilisateur, Invitation, DomaineEmail) et première migration, appliquée avec le rôle owner (`DATABASE_URL_MIGRATIONS`).
2. **Créer le rôle Postgres applicatif restreint (`NOBYPASSRLS`, section 6) avant toute autre chose** — `DATABASE_URL` doit pointer dessus dès le premier test, jamais vers le rôle owner par défaut de Neon, sous peine de valider un socle qui ne protège en réalité rien.
3. Inscription d'entreprise + connexion via Better-Auth (sans encore d'invitation, un seul compte Administrateur pour commencer à tester) + provisioning automatique de la boîte mail sur sous-domaine Vertex One.
4. Fonctions `peut()` et `portee()`, avec une première page protégée qui affiche des menus différents selon le rôle connecté — la preuve concrète que le socle fonctionne avant de construire quoi que ce soit d'autre par-dessus.
5. Flux d'invitation complet (Manager/Employé).
6. Politiques RLS sur les tables déjà créées, testées en essayant délibérément de faire fuiter une donnée entre deux entreprises de test — ce test doit échouer pour valider le socle.

Une fois ces six étapes validées, le Palier 1 (CRM, Devis/Facturation) peut commencer en réutilisant `peut()`, `portee()` et le modèle `entrepriseId` sans rien reconstruire.
