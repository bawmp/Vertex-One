# Checklist avant de vendre — comptes externes et variables d'environnement

Note vivante, pas une spécification figée : à cocher/mettre à jour au fil de l'avancement, jusqu'à ce que les trois points ci-dessous soient levés. Créée le 2026-09-14 suite à la question directe "puis-je déjà vendre cette application ?" — le cœur du produit (CRM, Facturation, RH, Projets, Documents, Réservations, Recrutement, Assistance client) est testé et fonctionnel ; ce sont ces trois intégrations externes, non configurées dans l'environnement de développement, qui bloquent un vrai client aujourd'hui.

## 0. Hébergement et domaine — décidé, pas encore fait (2026-09-17)

**Statut : rien de créé encore.** Discuté avec l'utilisateur : l'entreprise (Vertex Technology) a déjà un domaine, mais Vertex One aura son propre domaine dédié plutôt qu'un sous-domaine — cohérence marketing (le site vend "Vertex One" comme produit à part entière) et isolation de la réputation d'envoi email (Resend) par rapport aux autres communications de l'entreprise-mère.

- [ ] **Domaine** — acheter un domaine dédié (ex. `vertexone.cm`, `vertexone.app`, `vertexone.com` selon disponibilité/prix — le `.cm` camerounais peut avoir des conditions d'enregistrement plus restrictives, à vérifier avant de s'y engager).
- [ ] **Hébergement de l'application** — Vercel (zéro-config pour Next.js, gratuit pour démarrer, HTTPS/CDN automatiques). Connecter le dépôt GitHub, renseigner toutes les variables d'environnement listées dans ce fichier et `.env.example` dans les réglages du projet Vercel.
- [ ] **Hébergement du worker** — Vercel ne supporte pas un processus long-vivant (le worker graphile-worker a besoin d'une connexion persistante LISTEN/NOTIFY, voir CLAUDE.md). Un second service séparé (Railway ou Render, ~5-7 $/mois) dédié uniquement à `npm run worker`, avec `DATABASE_URL_WORKER` (endpoint direct Neon, sans "-pooler").
- [ ] Une fois le domaine actif : mettre à jour `BETTER_AUTH_URL` en production avec l'URL réelle (ex. `https://vertexone.cm`), condition pour que Better-Auth émette des cookies de session valides.

## 1. Stockage de fichiers — Cloudflare R2

**Statut : non configuré.** Sans ça, aucun fichier ne se sauvegarde réellement (logo d'entreprise, documents RH, pièces d'identité, CV de candidats, pièces jointes) — le code échoue proprement (pas de crash), mais rien n'est stocké.

- [ ] Créer un compte sur [dash.cloudflare.com](https://dash.cloudflare.com)
- [ ] R2 → créer un bucket (ex. `vertex-one-documents`)
- [ ] R2 → "Manage API Tokens" → jeton avec permission **Object Read & Write** sur ce bucket
- [ ] Noter l'**Account ID** (visible dans l'URL du tableau de bord R2)
- [ ] Renseigner dans `.env.local` (et les variables d'environnement de l'hébergeur en production) :
  ```
  R2_ACCOUNT_ID="..."
  R2_ACCESS_KEY_ID="..."
  R2_SECRET_ACCESS_KEY="..."
  R2_BUCKET_NAME="vertex-one-documents"
  ```

Aucun changement de code nécessaire — `src/lib/documents/stockage.ts` détecte automatiquement leur présence. Le bucket n'a pas besoin d'être public : le téléchargement passe par des URL signées temporaires.

## 2. Email transactionnel — Resend (domaine à vérifier)

**Statut : clé API présente, domaine non vérifié.** Resend refuse tout envoi vers une adresse autre que celle du propriétaire du compte tant qu'aucun domaine n'est vérifié — un vrai client ne recevrait aucun email (devis, facture, invitation, notification).

- [ ] Sur [resend.com/domains](https://resend.com/domains), ajouter le domaine (ex. `vertexone.cm`)
- [ ] Créer les enregistrements DNS affichés par Resend (SPF, DKIM, DMARC) chez le registrar/hébergeur DNS
- [ ] Attendre la vérification (quelques minutes à quelques heures selon le TTL DNS)
- [ ] **Changement de code requis ensuite** (pas seulement une variable d'env) — dans [src/lib/email/client.ts](../src/lib/email/client.ts) :
  ```ts
  const EXPEDITEUR_PAR_DEFAUT = "Vertex One <onboarding@resend.dev>";
  ```
  à remplacer par une adresse sur le domaine vérifié, ex. `"Vertex One <notifications@vertexone.cm>"`.

## 3. Paiement Mobile Money — CinetPay

**Statut (2026-09-18) : compte créé, en bac à sable (sandbox), KYC en attente de validation.** Contrairement aux deux points précédents, l'intégration côté code est déjà construite — il ne reste que la validation côté CinetPay avant de pouvoir encaisser réellement. Le même compte sert désormais à **deux usages** :
1. Paiement des factures client par les clients d'un tenant (`docs/crm-roadmap-post-commercialisation.md`, section 36).
2. **Abonnement plateforme** — chaque tenant paie 50 000 FCFA/mois à Vertex One lui-même (section 37) : essai gratuit de 14 jours, délai de grâce de 48h après échéance avant suspension d'accès.

- [x] Créer un compte business sur [cinetpay.com](https://cinetpay.com)
- [ ] Soumettre et valider le KYC (en cours — nécessaire avant tout retrait de fonds réels, délai variable, parfois plusieurs jours) — en attendant, les clés de bac à sable ne permettent que des paiements de test, jamais un vrai encaissement
- [ ] Renseigner dans `.env.local` / production :
  ```
  CINETPAY_APIKEY="..."
  CINETPAY_SITE_ID="..."
  ```
- [ ] Une fois les clés en place, vérifier de bout en bout : (a) un paiement de facture depuis `/app/facturation/factures/[id]` (bouton "Envoyer un lien de paiement Mobile Money"), et (b) un paiement d'abonnement depuis `/app/parametres/abonnement` (bouton "Régler mon abonnement") — ni l'un ni l'autre n'a jamais été vérifié avec un vrai encaissement dans l'environnement de développement, aucune clé CinetPay n'y étant disponible.
- [ ] Vérifier que le worker (`npm run worker`) tourne en production — la tâche planifiée quotidienne `verifier-abonnements` (8h) est ce qui envoie les rappels d'échéance et suspend l'accès en cas de non-paiement ; sans le worker actif, aucun tenant n'est jamais relancé ni suspendu.

**Rappel commercial, non négociable (voir CLAUDE.md)** : CinetPay est custodial, avec un délai de reversement par défaut de **8 jours** (réductible sur demande auprès de CinetPay après KYC) — ne jamais présenter ce paiement comme "instantané" ou "direct" dans le discours commercial.

## 4. Console interne plateforme — rôle Postgres et variables d'environnement

**Statut : code réel construit et testé, rôle à créer une seule fois en production.** `/plateforme` (vue propriétaire, toutes les entreprises clientes) a besoin d'un rôle Postgres dédié, séparé de celui de l'application — voir `docs/crm-roadmap-post-commercialisation.md`, section 38, pour le détail.

- [ ] Dans la console SQL de Neon (production), exécuter une fois :
  ```sql
  CREATE ROLE plateforme_lecture WITH LOGIN PASSWORD '...' BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  GRANT USAGE ON SCHEMA public TO plateforme_lecture;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO plateforme_lecture;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plateforme_lecture;
  ```
  (Choisir un mot de passe fort dédié — jamais réutiliser celui de `DATABASE_URL`/`DATABASE_URL_MIGRATIONS`.)
- [ ] Renseigner dans les variables d'environnement de l'hébergeur :
  ```
  DATABASE_URL_PLATEFORME="postgresql://plateforme_lecture:motdepasse@<même hôte que DATABASE_URL>/vertexone?sslmode=require"
  PLATEFORME_ADMINS="votre-email@exemple.cm"
  ```
  `PLATEFORME_ADMINS` : l'email d'un compte tenant **déjà existant** (le vôtre) — aucune nouvelle inscription nécessaire, la prochaine connexion avec ce compte suffit pour voir le lien "Console interne".

## 5. Chatbot IA "Kyria" (site vitrine) — clé Anthropic

**Statut : code réel construit et testé (sans clé), compte à créer.** `/` (site vitrine) affiche une bulle de chat "Kyria" qui répond réellement aux questions sur Vertex One — voir `docs/crm-roadmap-post-commercialisation.md`, section 41.

- [ ] Créer une clé API sur [console.anthropic.com](https://console.anthropic.com)
- [ ] Renseigner dans `.env.local` / production :
  ```
  ANTHROPIC_API_KEY="..."
  ```
- [ ] Une fois la clé en place, vérifier une vraie conversation (ex. "combien coûte l'abonnement ?" doit répondre 50 000 FCFA/mois, "le paiement est-il instantané ?" doit répondre non) — jamais vérifié avec une vraie clé dans l'environnement de développement.
- [ ] Avant un trafic important : ajouter une limitation de débit sur `/api/kyria` (aucune pour l'instant, voir roadmap section 41) — un chat public sans authentification est exposé aux abus/coûts incontrôlés sans ce garde-fou.

## 6. Anti-spam One Form — Cloudflare Turnstile

**Statut : code réel construit et testé (sans clé), compte à créer.** Contrairement aux autres intégrations de cette liste, l'absence de clé ne bloque rien — le formulaire public reste utilisable sans protection anti-spam, ce qui est le vrai risque à corriger avant un usage à fort trafic.

- [ ] [dash.cloudflare.com](https://dash.cloudflare.com) → Turnstile → ajouter un site
- [ ] Renseigner dans `.env.local` / production :
  ```
  TURNSTILE_SECRET_KEY="..."
  NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."
  ```
- [ ] Vérifier qu'une soumission depuis `/formulaire/[slug]` affiche bien le widget et qu'un jeton invalide est refusé.

## 7. Chiffrement One Vault — clé maîtresse

**Statut : bloquant pour ce module précisément, pas pour le reste du produit.** Sans `VAULT_ENCRYPTION_KEY`, le module One Vault refuse toute création/modification de secret (fail-closed, volontaire — voir `src/lib/vault/crypto.ts`) plutôt que de stocker un mot de passe en clair. Aucun compte externe à créer, juste une clé à générer une seule fois.

- [ ] Générer une clé avec `openssl rand -base64 32`
- [ ] Renseigner dans `.env.local` / production :
  ```
  VAULT_ENCRYPTION_KEY="..."
  ```
- [ ] **Ne jamais régénérer cette clé une fois des secrets réels enregistrés** — tout secret chiffré avec l'ancienne clé deviendrait définitivement indéchiffrable (voir le comportement testé dans `tests/one-vault-crypto.test.ts`). La perdre équivaut à perdre tous les secrets stockés : la sauvegarder dans un gestionnaire de secrets séparé (pas seulement dans les variables d'environnement de l'hébergeur), pas uniquement sur la machine de développement.

## Ordre suggéré

0. **Domaine + hébergement** (à lancer en premier — le domaine conditionne la vérification Resend et `BETTER_AUTH_URL`, autant l'acheter tôt même si les autres étapes n'attendent pas dessus)
1. **R2** (5 minutes, débloque immédiatement logos/documents/CV)
2. **Resend** (le délai de propagation DNS peut prendre du temps — à lancer tôt, une fois le domaine choisi)
3. **CinetPay** (le plus long : KYC avant toute chose ; en attendant, l'encaissement manuel reste pleinement utilisable pour vendre dès que R2 et Resend sont prêts)
4. **Console interne** (5 minutes, indépendant des autres — peut être fait à tout moment)
5. **Kyria** (5 minutes, indépendant des autres — dégrade proprement tant que la clé n'existe pas)
6. **One Vault** (5 minutes, générer la clé — ne rien reporter à plus tard une fois de vrais secrets enregistrés)
7. **Turnstile** (5 minutes, indépendant des autres — recommandé avant d'ouvrir un formulaire One Form à un trafic public important)

## Hors scope de cette checklist (pas bloquant pour vendre)

- Changement de mot de passe en libre-service (gérable manuellement au démarrage) — le changement de forfait n'a plus lieu d'être, un seul abonnement plat désormais
- WhatsApp Business (Meta) — non configuré, dégrade proprement
- Domaine email personnalisé (Migadu) — jamais branché, dormant depuis le Palier 0
- Traduction anglaise complète — infrastructure + écrans les plus visibles seulement (voir roadmap, section 34)
