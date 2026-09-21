# Checklist avant de vendre — comptes externes et variables d'environnement

Note vivante, pas une spécification figée : à cocher/mettre à jour au fil de l'avancement, jusqu'à ce que les trois points ci-dessous soient levés. Créée le 2026-09-14 suite à la question directe "puis-je déjà vendre cette application ?" — le cœur du produit (CRM, Facturation, RH, Projets, Documents, Réservations, Recrutement, Assistance client) est testé et fonctionnel ; ce sont ces trois intégrations externes, non configurées dans l'environnement de développement, qui bloquent un vrai client aujourd'hui.

## 0. Hébergement et domaine — en grande partie fait (2026-09-17/18)

Discuté avec l'utilisateur : l'entreprise (Vertex Technology) a déjà un domaine, mais Vertex One a son propre domaine dédié plutôt qu'un sous-domaine — cohérence marketing (le site vend "Vertex One" comme produit à part entière) et isolation de la réputation d'envoi email (Resend) par rapport aux autres communications de l'entreprise-mère.

- [x] **Domaine** — `vertexone.cm` acheté. En attente d'activation par le registre (délai normal pour un `.cm`, en cours).
- [x] **Hébergement de l'application** — déployé sur Vercel (compte personnel, pas de Team — carte non acceptée pour créer une Team, contournable plus tard), connecté au dépôt GitHub `bawmp/Vertex-One`, branche `main`. URL actuelle : `https://vertex-one-bawmp.vercel.app`. Base de données de production créée (projet Neon séparé, base `vertexone-prod`, même compute que le développement — voir note ci-dessous), rôles restreints `app_vertexone_prod`/`plateforme_lecture_prod` créés et vérifiés (`NOBYPASSRLS` confirmé, insertion refusée sans `app.entreprise_id`), 95 migrations appliquées. Inscription réelle testée en production : compte ADMIN créé et fonctionnel.
- [x] **Hébergement du worker** — déployé sur Railway, commande de démarrage personnalisée `npm run worker`, connecté au même dépôt/branche. Logs confirmés (worker actif).
- [x] **Domaine connecté (2026-09-19)** — `vertexone.cm` (domaine principal, sans redirection) et `www.vertexone.cm` (redirection 308 vers le domaine principal) sur Vercel. Le registrar (CleanDev Agency) bloquait l'édition DNS sans hébergement acheté chez lui : contourné en changeant les nameservers vers Cloudflare (DNS gratuit) — enregistrements `A`/`CNAME` vers Vercel en "DNS uniquement" (nuage gris). `BETTER_AUTH_URL="https://vertexone.cm"` sur Vercel et Railway.

**Note sur la base de production** : `vertexone-prod` est une base séparée du développement (`neondb`) mais dans le **même projet Neon**, donc le même compute — un test de charge en dev pourrait ralentir la production. Acceptable tant qu'il n'y a pas de vrais clients ; à séparer en projet Neon distinct si ça devient un problème réel.

## 1. Stockage de fichiers — Cloudflare R2

**Statut : configuré et vérifié (2026-09-18).** Compte Cloudflare existant réutilisé (déjà utilisé pour un autre projet, bh2-group) — un bucket dédié avec un jeton API restreint à ce seul bucket suffit à isoler les deux usages, pas besoin d'un compte séparé. Upload réel testé en production (logo d'entreprise) : succès.

- [x] Compte Cloudflare (existant, réutilisé)
- [x] R2 → bucket créé (`vertex-one-documents`)
- [x] R2 → jeton d'API du compte, permission **Lecture et écriture d'objets**, restreint à ce bucket
- [x] Renseigné dans Vercel (production) :
  ```
  R2_ACCOUNT_ID="..."
  R2_ACCESS_KEY_ID="..."
  R2_SECRET_ACCESS_KEY="..."
  R2_BUCKET_NAME="vertex-one-documents"
  ```

Aucun changement de code nécessaire — `src/lib/documents/stockage.ts` détecte automatiquement leur présence. Le bucket n'a pas besoin d'être public : le téléchargement passe par des URL signées temporaires.

## 2. Email transactionnel — Resend

**Statut (2026-09-19) : domaine `vertexone.cm` vérifié, expéditeur `notifications@vertexone.cm` en code, envoi réel confirmé vers deux adresses (dont une non propriétaire du compte).**

- [x] Domaine ajouté sur [resend.com/domains](https://resend.com/domains) (région eu-west-1) — enregistrements DKIM, SPF/CNAME créés dans Cloudflare DNS (nuage gris)
- [x] Domaine vérifié
- [x] `EXPEDITEUR_PAR_DEFAUT` changé dans [src/lib/email/client.ts](../src/lib/email/client.ts)
- [ ] Enregistrement DMARC (`_dmarc`, `v=DMARC1; p=none; rua=mailto:...`) affiché comme optionnel par Resend — à ajouter dans Cloudflare pour renforcer la délivrabilité
- [ ] Vérifier que le déploiement Vercel de production contient bien ce changement (push sur `main`)

## 3. Paiement Mobile Money — CamPay

**Statut (2026-09-21) : CamPay remplace CinetPay** (dont l'authentification restait bloquée par la liste blanche d'adresses IP). Intégration écrite et vérifiée contre le **bac à sable** de CamPay (jeton, lien de paiement, lecture d'une transaction, signature d'une notification) ; **aucun paiement réel n'a encore été fait**. Le même compte sert **deux usages** :
1. Paiement des factures client par les clients d'un tenant (`docs/crm-roadmap-post-commercialisation.md`, section 36).
2. **Abonnement plateforme** — chaque tenant paie 50 000 FCFA/mois à Vertex One lui-même (section 37) : essai gratuit de 14 jours, délai de grâce de 48h après échéance avant suspension d'accès.

- [x] Créer un compte CamPay et une application (bac à sable)
- [x] Renseigner dans `.env.local` (identifiants du bac à sable) : `CAMPAY_ENV=demo`, `CAMPAY_TOKEN`, `CAMPAY_USERNAME`, `CAMPAY_PASSWORD`, `CAMPAY_WEBHOOK_KEY` — voir `.env.example`
- [ ] **Passer en production côté CamPay** : faire valider le compte/l'application (vérification d'identité de l'entreprise) pour obtenir les identifiants **de production**. Ceux du bac à sable ne fonctionnent pas sur l'API réelle (constaté : 401) et le bac à sable plafonne chaque transaction à **25 FCFA** — un abonnement de 50 000 FCFA n'y passe pas.
- [ ] Renseigner dans l'environnement de **production** (Vercel → Settings → Environment Variables, cocher Production) : `CAMPAY_ENV=production`, `CAMPAY_TOKEN` (ou `CAMPAY_USERNAME` + `CAMPAY_PASSWORD`), `CAMPAY_WEBHOOK_KEY`. **Redéployer** ensuite. Sans `CAMPAY_ENV=production`, l'application appelle le bac à sable.
- [ ] **Saisir l'adresse de notification dans le tableau de bord CamPay** (paramètres de l'application, « webhook ») : `https://vertexone.cm/api/paiements/campay/notify` — une seule pour toute l'application, elle sert les factures et l'abonnement. Sans elle, un client peut payer sans que Vertex One le sache.
- [ ] Vérifier de bout en bout avec un petit paiement réel : (a) une facture depuis son lien public (« Payer maintenant »), (b) l'abonnement depuis `/app/parametres/abonnement`. Contrôler que la facture passe à « payée » et qu'un règlement apparaît.
- [ ] **Se renseigner auprès de CamPay** sur ses conditions réelles (à ne pas supposer) : commission par transaction, **délai de reversement** des fonds vers l'entreprise, plafonds, modalités de retrait. Aucun délai chiffré n'est affiché sur le site ni dans Kyria tant que ce n'est pas confirmé.
- [ ] Vérifier que le worker (`npm run worker`) tourne en production — la tâche planifiée quotidienne `verifier-abonnements` (8h) est ce qui envoie les rappels d'échéance et suspend l'accès en cas de non-paiement ; sans le worker actif, aucun tenant n'est jamais relancé ni suspendu.

**Fonctionnement** : la facture ou l'abonnement crée une ligne de tentative, puis un lien de paiement CamPay (`POST /get_payment_link/`, référence externe `fac_<id>` ou `abo_<id>`) ; le client paie sur la page hébergée par CamPay (MTN, Orange). CamPay notifie ensuite `/api/paiements/campay/notify` : **rien de la notification n'est cru**, la transaction est relue chez CamPay (statut, montant, référence externe) avant toute écriture, et un montant différent de celui de la tentative n'est jamais confirmé. Si CamPay est injoignable au moment de la notification, la route répond 503 pour qu'il rappelle.

**Rappel commercial, non négociable (voir CLAUDE.md)** : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct » — les fonds sont reversés avec un délai, et aucun nombre de jours n'est annoncé tant que CamPay ne l'a pas confirmé.

## 4. Console interne plateforme — rôle Postgres et variables d'environnement

**Statut (2026-09-18) : le rôle existe déjà en production** (`plateforme_lecture_prod`, créé lors de la mise en place initiale du 2026-09-17/18 — voir section 0 ; vérifié directement : `BYPASSRLS` actif, `SELECT` accordé sur 105 tables + ACL par défaut pour les futures tables). Il ne manque que le mot de passe (jamais enregistré nulle part de récupérable) et les deux variables d'environnement côté Vercel.

- [ ] Dans la console SQL de Neon (projet `vertexone-prod`), exécuter une fois :
  ```sql
  ALTER ROLE plateforme_lecture_prod WITH PASSWORD '...';
  ```
- [ ] Renseigner dans les variables d'environnement de Vercel (production) :
  ```
  DATABASE_URL_PLATEFORME="postgresql://plateforme_lecture_prod:motdepasse@ep-quiet-band-a59v7aa3-pooler.us-east-2.aws.neon.tech/vertexone-prod?sslmode=require&channel_binding=require"
  PLATEFORME_ADMINS="votre-email@exemple.cm"
  ```
  `PLATEFORME_ADMINS` : compte ADMIN déjà existant en production (inscription réelle testée le 2026-09-17/18) — aucune nouvelle inscription nécessaire, la prochaine connexion avec ce compte suffit pour voir le lien "Console interne". Valeurs réelles échangées en conversation le 2026-09-18, jamais enregistrées ici en clair.

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

- [ ] Générer une clé dédiée à la production avec `openssl rand -base64 32` — **différente de celle du développement** (jamais partager une clé de chiffrement entre environnements) — et la renseigner dans les variables d'environnement de Vercel :
  ```
  VAULT_ENCRYPTION_KEY="..."
  ```
  (Valeur réelle générée et échangée en conversation le 2026-09-18, jamais enregistrée ici en clair.)
- [ ] **Ne jamais régénérer cette clé une fois des secrets réels enregistrés** — tout secret chiffré avec l'ancienne clé deviendrait définitivement indéchiffrable (voir le comportement testé dans `tests/one-vault-crypto.test.ts`). La perdre équivaut à perdre tous les secrets stockés : la sauvegarder dans un gestionnaire de secrets séparé (pas seulement dans les variables d'environnement de l'hébergeur), pas uniquement sur la machine de développement.

## 8. Migration de production — champ « Fichier » de One Form

**Les migrations ne s'appliquent pas automatiquement au déploiement Vercel.** Le code du champ « Fichier » (2026-09-19) est déployé par un simple push, mais tant que la valeur d'enum n'existe pas dans la base de production, ajouter un champ de ce type échoue (le reste de One Form n'est pas affecté).

- [ ] Dans la console SQL de Neon, projet `vertexone-prod` (**pas** `neondb`), exécuter une fois :
  ```sql
  ALTER TYPE "type_champ_formulaire" ADD VALUE IF NOT EXISTS 'FICHIER';
  ```
  (Sans risque et sans effet sur les données : ajoute seulement une valeur autorisée. Rejouable sans erreur grâce à `IF NOT EXISTS`.)
- [ ] Vérifier ensuite sur `vertexone.cm` : créer un formulaire, ajouter un champ « Fichier », le publier, envoyer un PDF depuis le lien public.

## 9. Migration de production — page carrières (One Recruit)

**À appliquer AVANT de pousser le code.** Contrairement au champ « Fichier » (§8), la page publique `/carrieres/[slug]` lit les deux nouvelles colonnes dans sa requête : déployée sur une base de production non migrée, elle afficherait « page introuvable » pour toute entreprise qui a déjà publié sa page carrières.

- [ ] Dans la console SQL de Neon, projet `vertexone-prod` (**pas** `neondb`), exécuter une fois :
  ```sql
  ALTER TABLE "parametre_recrutement" ADD COLUMN IF NOT EXISTS "avantages" json;
  ALTER TABLE "poste_ouvert" ADD COLUMN IF NOT EXISTS "type_contrat" text;
  ```
  (Deux colonnes nullables, sans effet sur les données existantes, rejouable sans erreur.)
- [ ] Vérifier ensuite sur `vertexone.cm` : Recrutement → Paramètres (lien public affiché), créer un poste avec un type de contrat, ouvrir la page publique, postuler avec un PDF.

## Ordre suggéré

0. **Domaine + hébergement** (à lancer en premier — le domaine conditionne la vérification Resend et `BETTER_AUTH_URL`, autant l'acheter tôt même si les autres étapes n'attendent pas dessus)
1. **R2** (5 minutes, débloque immédiatement logos/documents/CV)
2. **Resend** (le délai de propagation DNS peut prendre du temps — à lancer tôt, une fois le domaine choisi)
3. **CamPay** (le plus long : validation du compte de production avant toute chose ; en attendant, l'encaissement manuel reste pleinement utilisable pour vendre dès que R2 et Resend sont prêts)
4. **Console interne** (5 minutes, indépendant des autres — peut être fait à tout moment)
5. **Kyria** (5 minutes, indépendant des autres — dégrade proprement tant que la clé n'existe pas)
6. **One Vault** (5 minutes, générer la clé — ne rien reporter à plus tard une fois de vrais secrets enregistrés)
7. **Turnstile** (5 minutes, indépendant des autres — recommandé avant d'ouvrir un formulaire One Form à un trafic public important)

## Hors scope de cette checklist (pas bloquant pour vendre)

- Changement de mot de passe en libre-service (gérable manuellement au démarrage) — le changement de forfait n'a plus lieu d'être, un seul abonnement plat désormais
- WhatsApp Business (Meta) — non configuré, dégrade proprement
- Domaine email personnalisé (Migadu) — jamais branché, dormant depuis le Palier 0
- Traduction anglaise complète — infrastructure + écrans les plus visibles seulement (voir roadmap, section 34)
