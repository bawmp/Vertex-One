@AGENTS.md

# Vertex One — règles non négociables

Suite de gestion multi-tenant pour entreprises de services au Cameroun. Spécifications complètes dans `docs/` :
`cahier-des-charges-suite-locale-entreprises-services.md` (point d'entrée), `strategie-suite-locale-entreprises-services.md`, et `palier-0` à `palier-6-*-specification-technique.md`.

**Construire les paliers dans l'ordre (0 → 6), chacun testé et déployable avant le suivant. Ne jamais avancer au palier suivant tant que le test de fuite multi-tenant du palier en cours n'a pas échoué comme prévu (voir palier-0, section 9).**

## Règles de sécurité multi-tenant — sans exception

- Toute nouvelle table de données porte une colonne `entrepriseId` — sans exception — et reçoit une politique Row-Level Security dès sa création.
- Toute requête vers une table protégée par RLS passe par le helper `avecEntreprise()` (voir palier-0 section 6), qui exécute `SET LOCAL app.entreprise_id` et la requête dans **la même transaction** Drizzle. Jamais de requête RLS en dehors de ce helper — avec le driver `neon-serverless` (jamais `neon-http`, qui ne supporte pas `db.transaction()`).
- Exception : les tables consultées par Better-Auth (utilisateur, session, compte) restent en RLS permissive, car ses requêtes s'exécutent avant qu'une session authentifiée n'existe. La RLS stricte s'applique aux tables métier uniquement.
- Aucune fonction serveur ne fait confiance à une donnée envoyée par le client (rôle, entrepriseId) — uniquement à la session signée par le serveur (Better-Auth).
- Toute action ou tout accès à une route vérifie `peut()`/`portee()` et, si la fonctionnalité est verrouillée par forfait ou add-on, `disponible()` — toujours côté serveur, jamais seulement dans l'interface.
- Après chaque nouveau module touchant à des données d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux données d'une autre.
- Tout identifiant transmis à un service externe partagé entre plusieurs entreprises clientes (Migadu, NotchPay, le prestataire de chat...) est préfixé par l'`entrepriseId`.

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
