# Checklist avant de vendre — comptes externes et variables d'environnement

Note vivante, pas une spécification figée : à cocher/mettre à jour au fil de l'avancement, jusqu'à ce que les trois points ci-dessous soient levés. Créée le 2026-09-14 suite à la question directe "puis-je déjà vendre cette application ?" — le cœur du produit (CRM, Facturation, RH, Projets, Documents, Réservations, Recrutement, Assistance client) est testé et fonctionnel ; ce sont ces trois intégrations externes, non configurées dans l'environnement de développement, qui bloquent un vrai client aujourd'hui.

## 0. Hébergement et domaine — en grande partie fait (2026-09-17/18)

Discuté avec l'utilisateur : l'entreprise (Vertex Technology) a déjà un domaine, mais Vertex One a son propre domaine dédié plutôt qu'un sous-domaine — cohérence marketing (le site vend "Vertex One" comme produit à part entière) et isolation de la réputation d'envoi email (Resend) par rapport aux autres communications de l'entreprise-mère.

- [x] **Domaine** — `vertexone.cm` acheté. En attente d'activation par le registre (délai normal pour un `.cm`, en cours).
- [x] **Hébergement de l'application** — déployé sur Vercel (compte personnel, pas de Team — carte non acceptée pour créer une Team, contournable plus tard), connecté au dépôt GitHub `bawmp/Vertex-One`, branche `main`. URL actuelle : `https://vertex-one-bawmp.vercel.app`. Base de données de production créée (projet Neon séparé, base `vertexone-prod`, même compute que le développement — voir note ci-dessous), rôles restreints `app_vertexone_prod`/`plateforme_lecture_prod` créés et vérifiés (`NOBYPASSRLS` confirmé, insertion refusée sans `app.entreprise_id`), 95 migrations appliquées. Inscription réelle testée en production : compte ADMIN créé et fonctionnel.
- [x] **Hébergement du worker** — déployé sur Railway, commande de démarrage personnalisée `npm run worker`, connecté au même dépôt/branche. Logs confirmés (worker actif).
- [ ] **Domaine à connecter** — dès que `vertexone.cm` devient actif : l'ajouter dans Vercel (Settings → Domains), mettre à jour les enregistrements DNS chez le registrar, puis remettre `BETTER_AUTH_URL` sur `https://vertexone.cm` (actuellement réglée temporairement sur l'URL `.vercel.app`) — **à la fois sur Vercel et sur Railway**, les deux en dépendent (Better-Auth pour les cookies de session, le worker pour construire les liens dans les emails de rappel d'abonnement).

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

**Statut (2026-09-18) : migré vers le package officiel `cinetpay-js`, round-trip réel vérifié en bac à sable (authentification + initialisation + vérification de statut), KYC toujours en attente de validation.** Le même compte sert **deux usages** :
1. Paiement des factures client par les clients d'un tenant (`docs/crm-roadmap-post-commercialisation.md`, section 36).
2. **Abonnement plateforme** — chaque tenant paie 50 000 FCFA/mois à Vertex One lui-même (section 37) : essai gratuit de 14 jours, délai de grâce de 48h après échéance avant suspension d'accès.

- [x] Créer un compte business sur [cinetpay.com](https://cinetpay.com)
- [ ] Soumettre et valider le KYC (en cours — nécessaire avant tout retrait de fonds réels, délai variable, parfois plusieurs jours) — en attendant, les clés de bac à sable ne permettent que des paiements de test, jamais un vrai encaissement
- [x] Renseigner dans `.env.local` (clés sandbox) :
  ```
  CINETPAY_APIKEY="..."
  CINETPAY_APIPASSWORD="..."
  ```
- [ ] Renseigner les mêmes variables dans l'environnement de **production** (clés `sk_live_...` une fois le KYC validé — les clés `sk_test_...` de dev ne fonctionneront jamais en dehors du bac à sable)
- [ ] **Whitelister l'IP de sortie de production** dans le tableau de bord CinetPay (section Intégration/API — "This Ip is not whitelisted", code 2011, sinon) : Vercel (qui exécute les Server Actions déclenchant le paiement) n'a pas d'IP de sortie fixe par défaut, contrairement à une machine de dev classique — à résoudre avant tout test en production (IP statique payante côté Vercel, ou faire transiter l'appel par Railway où tourne déjà le worker, qui peut avoir une IP plus stable).
- [x] Vérifié en bac à sable (script scratch contre le vrai `cinetpay-js`, supprimé après usage) : authentification OAuth réussie, `payment.initialize()` renvoie une vraie `paymentUrl` CinetPay avec redirection, `payment.getStatus()` correctement remonté.
- [ ] Une fois les clés live en place, vérifier de bout en bout en conditions réelles : (a) un paiement de facture depuis `/app/facturation/factures/[id]` (bouton "Envoyer un lien de paiement Mobile Money"), et (b) un paiement d'abonnement depuis `/app/parametres/abonnement` (bouton "Régler mon abonnement") — jamais vérifié avec un vrai encaissement (argent réel) à ce stade, seulement en bac à sable.
- [ ] Vérifier que le worker (`npm run worker`) tourne en production — la tâche planifiée quotidienne `verifier-abonnements` (8h) est ce qui envoie les rappels d'échéance et suspend l'accès en cas de non-paiement ; sans le worker actif, aucun tenant n'est jamais relancé ni suspendu.

**Rappel commercial, non négociable (voir CLAUDE.md)** : CinetPay est custodial, avec un délai de reversement par défaut de **8 jours** (réductible sur demande auprès de CinetPay après KYC) — ne jamais présenter ce paiement comme "instantané" ou "direct" dans le discours commercial.

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
