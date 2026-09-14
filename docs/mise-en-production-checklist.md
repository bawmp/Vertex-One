# Checklist avant de vendre — comptes externes et variables d'environnement

Note vivante, pas une spécification figée : à cocher/mettre à jour au fil de l'avancement, jusqu'à ce que les trois points ci-dessous soient levés. Créée le 2026-09-14 suite à la question directe "puis-je déjà vendre cette application ?" — le cœur du produit (CRM, Facturation, RH, Projets, Documents, Réservations, Recrutement, Assistance client) est testé et fonctionnel ; ce sont ces trois intégrations externes, non configurées dans l'environnement de développement, qui bloquent un vrai client aujourd'hui.

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

**Statut : intégration préparée (code réel), compte non créé.** Contrairement aux deux points précédents, l'intégration côté code est déjà construite — il ne reste que la partie compte/KYC côté CinetPay. Le même compte sert désormais à **deux usages** :
1. Paiement des factures client par les clients d'un tenant (`docs/crm-roadmap-post-commercialisation.md`, section 36).
2. **Abonnement plateforme** — chaque tenant paie 50 000 FCFA/mois à Vertex One lui-même (section 37) : essai gratuit de 14 jours, délai de grâce de 48h après échéance avant suspension d'accès.

- [ ] Créer un compte business sur [cinetpay.com](https://cinetpay.com)
- [ ] Soumettre et valider le KYC (nécessaire avant tout retrait de fonds réels — délai variable, parfois plusieurs jours)
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

## Ordre suggéré

1. **R2** (5 minutes, débloque immédiatement logos/documents/CV)
2. **Resend** (le délai de propagation DNS peut prendre du temps — à lancer tôt)
3. **CinetPay** (le plus long : KYC avant toute chose ; en attendant, l'encaissement manuel reste pleinement utilisable pour vendre dès que R2 et Resend sont prêts)
4. **Console interne** (5 minutes, indépendant des trois autres — peut être fait à tout moment)

## Hors scope de cette checklist (pas bloquant pour vendre)

- Changement de mot de passe en libre-service (gérable manuellement au démarrage) — le changement de forfait n'a plus lieu d'être, un seul abonnement plat désormais
- WhatsApp Business (Meta) — non configuré, dégrade proprement
- Domaine email personnalisé (Migadu) — jamais branché, dormant depuis le Palier 0
- Traduction anglaise complète — infrastructure + écrans les plus visibles seulement (voir roadmap, section 34)
