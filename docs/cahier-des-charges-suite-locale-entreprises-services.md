# Cahier des charges — Vertex One (Vertex Technology) : suite de gestion tout-en-un pour entreprises de services au Cameroun

*Document de synthèse pour démarrage du développement — Septembre 2026*

Ce document est le point d'entrée du projet : il résume les décisions prises, renvoie vers les spécifications détaillées de chaque palier pour l'implémentation, et donne les instructions concrètes pour démarrer le développement avec Claude Code. Les huit documents produits jusqu'ici forment un tout cohérent — celui-ci en est la table des matières et la synthèse opérationnelle.

## 1. Présentation du projet

Une plateforme SaaS tout-en-un, à l'image de Zoho One, destinée aux entreprises de services au Cameroun (à commencer par Douala et Yaoundé) : agences, artisans, cabinets, et plus largement toute entreprise de moins de 15 personnes que ni Zoho (trop cher, facturé en dollars, mal adapté aux usages locaux) ni Odoo (trop coûteux à mettre en œuvre pour ce segment) ne servent bien aujourd'hui.

Le produit se différencie par trois choix structurants : Mobile Money comme moyen de paiement natif plutôt qu'en option (Orange Money et MTN MoMo captent ensemble 97% des transactions mobiles au Cameroun), WhatsApp comme canal de communication principal, et une conformité construite dès la fondation plutôt qu'ajoutée après coup — facturation électronique DGI, signature électronique ANTIC, comptabilité SYSCOHADA, protection des données personnelles.

## 2. Utilisateurs et rôles

Quatre rôles fixes, définis dans le code plutôt que personnalisables par chaque client (décision détaillée dans le document du Palier 0) : **Administrateur** (accès total), **Manager** (son équipe), **Employé** (ce qui lui est assigné), **Client** (portail restreint, à partir du Palier 4). Chaque droit se décline selon une portée — `TOUT`, `EQUIPE`, ou `PROPRE` — appliquée uniformément à travers tous les modules.

## 3. Stack technique retenue

TypeScript de bout en bout, Next.js (App Router), PostgreSQL via Drizzle ORM (hébergé chez Neon ou Supabase), Tailwind CSS + shadcn/ui, hébergement Vercel + Neon, stockage de fichiers Cloudflare R2, file d'attente légère adossée à Postgres pour les tâches planifiées (graphile-worker ou équivalent). Authentification construite sur Better-Auth (bibliothèque open-source auto-hébergée, pas un service tiers propriétaire) au-dessus de tables `Utilisateur`/rôles entièrement custom — le modèle de rôles reste trop spécifique au produit pour dépendre d'un fournisseur externe, mais la plomberie de session/cookies/CSRF n'a pas besoin d'être réécrite à la main. Génération de PDF via React-PDF (pas de navigateur headless en production). Paiements Mobile Money via NotchPay (orchestrateur CEMAC, Orange Money + MTN MoMo unifiés, modèle custodial avec délai de reversement). Communication client via l'API Cloud WhatsApp Business de Meta directement (pas de BSP intermédiaire type Twilio, pour éviter une marge par message facturée en dollars). Notifications transactionnelles (facture envoyée, relance, invitation) via Resend ou Postmark. Boîte mail professionnelle hébergée par entreprise cliente (sous-domaine Vertex One par défaut, ou domaine propre du client en option) via l'API de Migadu (domaine + boîte créés par programme, enregistrements DNS renvoyés en JSON pour affichage au client) — jamais un serveur SMTP/IMAP maison. Détail complet et justification de chaque choix dans le document de stratégie, section Architecture technique.

## 4. Modèle économique et verrouillage des fonctionnalités

Abonnement mensuel par entreprise (pas par utilisateur), facturé en FCFA, payable par Mobile Money :

| Forfait | Contenu | Prix indicatif |
|---|---|---|
| **Starter** | CRM, Devis/Facturation (encaissement manuel) | 15 000 – 25 000 FCFA/mois |
| **Pro** | + Paiements Mobile Money automatisés, Dossiers/Projets, Chat interne, Documents, Annonces | 35 000 – 55 000 FCFA/mois |
| **Business** | + Signature électronique, Contrats, Comptabilité complète, Ressources Humaines | 60 000 – 90 000 FCFA/mois |
| **Add-ons à la carte** | Facturation d'abonnements récurrents, et futurs modules du Palier 6 | Tarif unitaire séparé, indépendant du forfait |

Le verrouillage repose sur une fonction unique `disponible(entreprise, fonctionnalite)`, vérifiée côté serveur avant toute action ou tout accès à une route, jamais seulement masquée côté interface. Elle combine une matrice fixe par forfait et une table d'add-ons activables à la carte. Détail dans le document de stratégie et dans les Paliers 1, 2, 3 et 6.

## 5. Périmètre fonctionnel — vue d'ensemble des sept paliers

Chaque palier est vendable seul dès qu'il est terminé — ne pas attendre la fin de la liste pour commencer à facturer les premiers clients.

| Palier | Contenu | Forfait | Document détaillé |
|---|---|---|---|
| **0** | Comptes, rôles, permissions, isolation multi-tenant | Socle, tous forfaits | `palier-0-roles-permissions-specification-technique.md` |
| **1** | CRM, Devis, Facturation, encaissement | Starter (Pro pour le paiement automatisé) | `palier-1-crm-facturation-specification-technique.md` |
| **2** | Dossiers clients (permanents) et Projets (bornés) | Pro | `palier-2-projets-dossiers-specification-technique.md` |
| **3** | Chat interne, documents, annonces | Pro | `palier-3-collaboration-interne-specification-technique.md` |
| **4** | Signature électronique, Contrats, Comptabilité complète | Business | `palier-4-signature-contrats-comptabilite-specification-technique.md` |
| **5** | Ressources humaines (hors paie) | Business | `palier-5-ressources-humaines-specification-technique.md` |
| **6** | Marketing, visioconférence, facturation d'abonnements | Pro/Business + add-on | `palier-6-marketing-communication-specification-technique.md` |

Le document de stratégie (`strategie-suite-locale-entreprises-services.md`) contient le diagnostic de marché complet, le détail de chaque module par rapport aux 23 applications Zoho actives observées, et la stratégie de commercialisation.

## 6. Exigences de conformité réglementaire — à ne jamais traiter comme secondaire

- **Facturation électronique (DGI, loi de finances 2026)** : numérotation séquentielle sans trou, contrôle continu des transactions à venir — architecture de facturation conçue pour s'y brancher (Palier 1).
- **Mentions légales de facturation** : NIU, RCCM, TVA à 19,25% affichée par ligne (Palier 1).
- **Signature électronique (ANTIC, loi n°2010/012)** : signature simple avec journal d'audit par défaut, option de signature certifiée via une autorité accréditée pour les documents à forts enjeux (Palier 4).
- **Comptabilité (SYSCOHADA)** : écritures générées automatiquement depuis la facturation, états financiers en brouillon à valider par un professionnel avant tout dépôt officiel (Palier 4).
- **Protection des données personnelles (loi du 23 décembre 2024, pleinement applicable depuis le 23 juin 2026)** : consentement, restriction d'accès aux documents/champs sensibles, journal d'accès, droit à l'effacement réel (Palier 3, étendu au Palier 5 pour les données RH).
- **Paie (CNPS, IRPP, Code du travail)** : délibérément exclue du produit — données exportées pour un partenaire spécialisé (Palier 5).

## 7. Instructions de démarrage pour Claude Code

**Étape 1 — Initialiser le projet.** `create-next-app` avec TypeScript et Tailwind, ajout de Drizzle ORM et connexion à une base Postgres de développement (Neon), installation de shadcn/ui et de Better-Auth. **Créer immédiatement un rôle Postgres applicatif `NOBYPASSRLS`** (le rôle owner par défaut de Neon a `BYPASSRLS`, qui rend toute politique RLS silencieusement inactive) — `DATABASE_URL` pointe sur ce rôle restreint, `DATABASE_URL_MIGRATIONS` sur le rôle owner pour les migrations uniquement (voir le document du Palier 0, section 6).

**Étape 2 — Palier 0 d'abord, intégralement, avant tout autre module.** Schéma Drizzle (`Entreprise`, `Utilisateur`, `Invitation`, `DomaineEmail`), inscription et connexion, fonctions `peut()`/`portee()`, flux d'invitation complet avec création automatique du Dossier RH et provisioning automatique de la boîte mail (sous-domaine Vertex One), politiques RLS testées avec un scénario de fuite délibérée entre deux entreprises fictives (voir le document du Palier 0, section 9). Ne pas avancer au Palier 1 tant que ce test ne réussit pas.

**Étape 3 — Paliers suivants dans l'ordre**, chacun testé et déployable avant de passer au suivant : Palier 1 (CRM/Facturation), puis Palier 2 (Dossiers/Projets), puis Palier 3 (Collaboration), puis Paliers 4, 5 et 6 selon la demande réelle observée chez vos premiers clients pilotes.

**Étape 4 — À chaque nouveau module**, systématiquement : le modèle porte un `entrepriseId` ; une politique RLS est ajoutée ; les entrées nécessaires sont ajoutées à `MATRICE_PERMISSIONS` et, le cas échéant, à `FONCTIONNALITES_PAR_PLAN` ; un test vérifie qu'un Employé ne voit que ce que sa portée autorise.

## 8. Règles non négociables — à copier dans un fichier `CLAUDE.md` à la racine du projet

Claude Code lit automatiquement un fichier `CLAUDE.md` placé à la racine d'un projet et en tient compte à chaque session de travail. Copier la liste ci-dessous dans ce fichier garantit que ces règles, établies au fil de toute la conception, ne sont jamais oubliées au fil des sessions :

- Toute nouvelle table de données porte un champ `entrepriseId` — sans exception — et reçoit une politique de Row-Level Security dès sa création.
- Aucune fonction serveur ne fait confiance à une donnée envoyée par le client (rôle, entrepriseId) — uniquement à la session signée par le serveur.
- Une facture n'est jamais supprimée, quel que soit le rôle — seule une annulation (`AvoirFacture`) est possible.
- Un numéro de facture n'est généré qu'au moment exact de l'émission, jamais avant, via une opération atomique protégée contre les créations simultanées.
- Toute action ou tout accès à une route vérifie `peut()`/`portee()` et, si la fonctionnalité est verrouillée par forfait ou add-on, `disponible()` — toujours côté serveur, jamais seulement dans l'interface.
- Un document classé `PIECE_IDENTITE` ou `DONNEES_SANTE` reste restreint au responsable du dossier et à l'Administrateur, quel que soit l'accès normal au dossier qui le contient ; sa consultation est journalisée ; sa suppression réelle doit être possible sur demande légitime.
- Le salaire d'un employé n'est jamais rempli automatiquement et reste visible uniquement par l'Administrateur et l'intéressé.
- Aucun calcul de cotisation sociale (CNPS), d'IRPP, ou de bulletin de paie n'est implémenté dans le produit — seule l'exportation des données vers un partenaire est prévue.
- Tout identifiant transmis à un service externe partagé entre plusieurs entreprises clientes (le prestataire de chat, par exemple) est préfixé par l'`entrepriseId`.
- Après chaque nouveau module touchant à des données d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux données d'une autre.

## 9. Documents du projet

1. `strategie-suite-locale-entreprises-services.md` — stratégie, marché, positionnement, modèle économique, roadmap
2. `palier-0-roles-permissions-specification-technique.md` — comptes, rôles, permissions, isolation multi-tenant
3. `palier-1-crm-facturation-specification-technique.md` — CRM, devis, facturation, paiements
4. `palier-2-projets-dossiers-specification-technique.md` — dossiers clients et projets
5. `palier-3-collaboration-interne-specification-technique.md` — chat, documents, annonces, protection des données
6. `palier-4-signature-contrats-comptabilite-specification-technique.md` — signature électronique, contrats, comptabilité
7. `palier-5-ressources-humaines-specification-technique.md` — RH, suivi d'équipe
8. `palier-6-marketing-communication-specification-technique.md` — marketing, visioconférence, abonnements
9. Ce document — cahier des charges de synthèse et instructions de démarrage
