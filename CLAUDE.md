@AGENTS.md

# Vertex One — règles non négociables

Suite de gestion multi-tenant pour entreprises de services au Cameroun. Spécifications complètes dans `docs/` :
`cahier-des-charges-suite-locale-entreprises-services.md` (point d'entrée), `strategie-suite-locale-entreprises-services.md`, et `palier-0` à `palier-6-*-specification-technique.md`.

**Construire les paliers dans l'ordre (0 → 6), chacun testé et déployable avant le suivant. Ne jamais avancer au palier suivant tant que le test de fuite multi-tenant du palier en cours n'a pas échoué comme prévu (voir palier-0, section 9).**

## Règles de sécurité multi-tenant — sans exception

- Toute nouvelle table de données porte une colonne `entrepriseId` — sans exception — et reçoit une politique Row-Level Security dès sa création, avec `FORCE ROW LEVEL SECURITY` (sans quoi la policy ne s'applique pas au propriétaire de la table — précisément le rôle utilisé par la connexion applicative). Utiliser `pgPolicy()`/`.enableRLS()` de Drizzle dans `src/db/schema.ts` plutôt que du SQL séparé, et ajouter la clause `FORCE ROW LEVEL SECURITY` correspondante dans une migration custom (`drizzle-kit generate --custom`) — voir `drizzle/0001_force_row_level_security.sql`.
- **`DATABASE_URL` doit toujours pointer vers un rôle Postgres créé avec `NOBYPASSRLS`, jamais le rôle "owner" par défaut de Neon.** Le rôle owner (`neondb_owner` ou équivalent) a `BYPASSRLS` par défaut sur Neon : `FORCE ROW LEVEL SECURITY` ne le contraint pas, et toutes les politiques RLS deviennent silencieusement inactives — sans erreur, sans avertissement, une fuite totale entre entreprises indétectable en revue de code. Vérifié par exécution réelle du test de fuite (palier 0), qui échouait entièrement avec le rôle owner et passe avec un rôle restreint. Le rôle owner sert uniquement aux migrations, via `DATABASE_URL_MIGRATIONS` (voir `drizzle.config.ts` et `.env.example`).
- Toute requête vers une table protégée par RLS passe par le helper `avecEntreprise()` (voir `src/db/client.ts` et palier-0 section 6), qui exécute `SELECT set_config('app.entreprise_id', ..., true)` (jamais `SET LOCAL ... = $1` — syntaxe invalide côté protocole préparé Postgres, confirmé par erreur réelle) et la requête dans **la même transaction** Drizzle. Jamais de requête RLS en dehors de ce helper — avec le driver `neon-serverless` (jamais `neon-http`, qui ne supporte pas `db.transaction()`).
- Exception : les tables consultées par Better-Auth (utilisateur, session, compte) restent en RLS permissive, car ses requêtes s'exécutent avant qu'une session authentifiée n'existe. La RLS stricte s'applique aux tables métier uniquement. Cas particulier : une table qui a besoin d'une recherche anonyme par jeton secret (ex. `invitation`) peut avoir une politique de lecture permissive uniquement quand `app.entreprise_id` n'est pas positionné, jamais en écriture — voir `invitation` dans `src/db/schema.ts` pour le modèle à suivre.
- **Sur une connexion Neon fraîche (via le pooler), `current_setting('app.entreprise_id', true)` renvoie une chaîne vide `''`, pas SQL `NULL`.** Un test `OR ... IS NULL` pour détecter "aucune session active" ne se déclenche donc jamais — bug réel rencontré en testant le lien d'invitation anonyme, qui restait introuvable malgré une policy qui semblait correcte. Toujours écrire `nullif(current_setting('app.entreprise_id', true), '') IS NULL` pour ce genre de vérification.
- Aucune fonction serveur ne fait confiance à une donnée envoyée par le client (rôle, entrepriseId) — uniquement à la session signée par le serveur (Better-Auth).
- Toute action ou tout accès à une route vérifie `peut()`/`portee()` et, si la fonctionnalité est verrouillée par forfait ou add-on, `disponible()` — toujours côté serveur, jamais seulement dans l'interface.
- Après chaque nouveau module touchant à des données d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux données d'une autre.
- Tout identifiant transmis à un service externe partagé entre plusieurs entreprises clientes (Migadu, NotchPay, le prestataire de chat...) est préfixé par l'`entrepriseId`.

## Latence de connexion Neon — à connaître avant de crier au bug

La toute première connexion WebSocket qu'un process établit vers Neon via `drizzle-orm/neon-serverless` peut prendre 10 à 15 secondes (mesuré : 13,4s), contre ~1s pour les connexions suivantes une fois le pool "chaud". Symptômes déjà rencontrés à cause de ça : un test E2E qui échoue juste après un redémarrage du serveur de dev ou dans une nouvelle session, avec un timeout générique et aucune trace d'erreur applicative. Avant de chercher un bug dans le code : relancer une deuxième fois (le pool du process encore actif reste chaud), et prévoir un timeout de test généreux (60s minimum, voir `playwright.config.ts`) pour les parcours qui enchaînent plusieurs transactions réelles.

Au-delà du pool froid : sous sollicitation intensive prolongée (plusieurs heures de tests répétés), une requête isolée peut ponctuellement prendre 20 à 30 secondes même sur un pool déjà chaud (mesuré : 26s pour un simple `UPDATE`) — vraisemblablement le plan Neon gratuit qui régule/suspend le compute. Pour un parcours E2E qui enchaîne plusieurs Server Actions réelles (inscription, création, plusieurs transactions), donner un timeout par test bien au-delà de la somme attendue des étapes (`test.setTimeout(150_000)` par exemple) plutôt que de suspecter une régression dès qu'un test dépasse son budget habituel.

## Resend — domaine non vérifié tant que ce n'est pas fait explicitement

`RESEND_API_KEY` est configurée, mais **aucun domaine Vertex One n'est vérifié sur le compte** : Resend refuse (403 `validation_error`) tout envoi vers une adresse autre que celle du propriétaire du compte, quel que soit le destinataire réel demandé — confirmé par un envoi réel. L'expéditeur `src/lib/email/client.ts` utilise donc `onboarding@resend.dev` (bac à sable Resend), qui fonctionne pour tester la mécanique d'envoi mais ne peut pas atteindre de vrais clients. Avant toute mise en production (ou tout test destiné à un vrai prospect) : vérifier un domaine sur resend.com/domains, puis changer `EXPEDITEUR_PAR_DEFAUT` pour une adresse sur ce domaine. Un test automatisé qui envoie à une adresse `@*.test` échouera donc toujours avec ce message précis — normal, pas un bug.

## Règles métier — sans exception

- Une facture n'est jamais supprimée, quel que soit le rôle — seule une annulation (`AvoirFacture`) est possible.
- Un numéro de facture n'est généré qu'au moment exact de l'émission, jamais avant, via une opération atomique protégée contre les créations simultanées.
- Un document classé `PIECE_IDENTITE` ou `DONNEES_SANTE` reste restreint au responsable du dossier et à l'Administrateur, quel que soit l'accès normal au dossier qui le contient ; sa consultation est journalisée ; sa suppression réelle doit être possible sur demande légitime.
- Le salaire d'un employé n'est jamais rempli automatiquement et reste visible uniquement par l'Administrateur et l'intéressé.
- Aucun calcul de cotisation sociale (CNPS), d'IRPP, ou de bulletin de paie n'est implémenté dans le produit — seule l'exportation des données vers un partenaire est prévue.
- Le discours commercial et le code ne doivent jamais présenter le paiement Mobile Money (NotchPay) comme "instantané" ou "direct" — le modèle est custodial avec délai de reversement (voir stratégie, section 3).

## Stack

TypeScript de bout en bout, Next.js 16 (App Router, Turbopack), Drizzle ORM + PostgreSQL (Neon, driver `neon-serverless`), Better-Auth, Tailwind CSS + shadcn/ui, Cloudflare R2, graphile-worker, React-PDF, NotchPay (Mobile Money), API Cloud WhatsApp Business (Meta, direct), Resend/Postmark (email transactionnel), Migadu (boîte mail hébergée par entreprise cliente).

## Next.js 16 — ce projet n'est pas la version que tu connais par défaut

Ce projet utilise Next.js 16, dont plusieurs conventions cassent avec les versions antérieures. Avant d'écrire du code touchant au routage ou au cache, vérifier `node_modules/next/dist/docs/`. Points déjà rencontrés :

- Le fichier `middleware.ts` est déprécié — utiliser `proxy.ts` avec un export nommé `proxy` (pas `middleware`). C'est le fichier où la session Better-Auth sera vérifiée pour protéger les routes.
- `cookies()`, `headers()`, `draftMode()`, ainsi que `params`/`searchParams` sont **toujours asynchrones** — plus de fallback synchrone.
- ESLint utilise le format Flat Config (`eslint.config.mjs`) ; `next lint` n'existe plus, utiliser `eslint` directement.
- Turbopack est actif par défaut sur `next dev` et `next build`.

## Structure du dépôt

- `docs/` — spécifications de référence (jamais de code applicatif ici).
- `src/` — code de l'application Next.js.
