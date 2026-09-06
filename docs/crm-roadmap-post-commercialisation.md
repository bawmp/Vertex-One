# Zoho CRM & Zoho Books — ce qui reste à construire après la commercialisation

*Document de suivi, pas une spécification technique — à date du 2026-09-06.*

Le CRM de Vertex One (Leads/Contacts/Comptes/Deals + Accueil) et le module Documents financiers (inspiré de Zoho Books) sont fonctionnels et vendables en l'état. Cette page recense ce qui a été identifié comme manquant par rapport aux vrais produits Zoho pendant leur reconstruction, pour ne rien perdre en attendant d'y revenir. Ce n'est pas un gel : rien n'empêche de reprendre l'un de ces points avant la commercialisation si un besoin se présente — cette page sert de mémoire, pas de barrière.

## 1. Modules Zoho non construits

Liste communiquée par l'utilisateur (2026-09-06) — l'arborescence réelle des modules dans Zoho CRM :

**Ventes**
- Prospects, Contacts, Comptes, Affaires — **construits** (Leads/Contacts/Comptes/Deals).
- Documents — déjà couvert par le module "Documents" de Vertex One (Palier 3), pas au sein du CRM chez Zoho non plus dans l'esprit, mais rattaché à un Dossier plutôt qu'à un Deal ; à réévaluer si un besoin réel de documents attachés à un Deal (avant conversion en Dossier) se présente.
- Campagnes — déjà couvert par le module "Marketing" de Vertex One (Palier 6), pas construit spécifiquement dans le CRM.

**Activités**
- Tâches, Réunions — **construites** (tache_crm, reunion_crm), mais uniquement créables depuis l'Accueil CRM pour l'instant (voir section 2).
- Appels — pas d'entité dédiée ; aujourd'hui seulement approximé par `interaction.type = "appel"` sur un Contact, sans durée, sans issue d'appel (répondu/messagerie/occupé), sans planification.

**Inventaire** (aucun équivalent construit)
- Tarifs (Price Books)
- Produits
- Devis / Factures / Commandes client — Vertex One a déjà "Devis"/"Factures" mais rattachés à un Deal dans un module "Facturation" séparé, pas un catalogue Produits/Tarifs réutilisable ligne par ligne comme chez Zoho.
- Bons de commande, Fournisseurs

**Autres modules autonomes** (aucun équivalent construit)
- Solutions (base de connaissances)
- Médias sociaux
- Prévisions (Forecasts)
- Tickets, Services (support client)
- Projects — Vertex One a déjà un module "Projets" distinct (Palier 2), avec un modèle différent (Dossier/Projet/Tâche rattachés à un Contact, pas à un Deal) ; pas la peine de dupliquer, seulement vérifier un jour si les deux devraient converger.
- Voix du client (Voice of Customer / retours clients structurés)

Aucun de ces modules n'a été chiffré ni conçu — à spécifier au moment où un besoin client réel se présente, plutôt que de deviner l'ordre de priorité aujourd'hui.

## 2. Activités directement depuis les fiches Lead/Contact/Deal

Aujourd'hui, une Tâche ou une Réunion CRM ne se crée que depuis l'Accueil (`/app/crm`), avec un sélecteur "Relatif à" manuel. Chez Zoho, chaque fiche Lead/Contact/Deal a sa propre section "Activités" où on ajoute directement une tâche/réunion déjà pré-rattachée à ce record, sans ressaisir la relation. À ajouter sur `src/app/app/leads/[id]/page.tsx`, `src/app/app/contacts/[id]/page.tsx` et `src/app/app/deals/[id]/page.tsx`.

## 3. Simplifications connues, à revoir si un client s'en plaint

- **"Mes Deals non touchés"** : seuil fixe de 7 jours sans changement de statut (`historiqueStatutDeal`), codé en dur dans `src/app/app/crm/page.tsx`. Zoho permet un seuil configurable par entreprise — non fait, pas demandé.
- **Priorité/État des Tâches CRM** : `statutTacheCrm` n'a que 4 valeurs (NON_COMMENCEE/EN_COURS/TERMINEE/DIFFEREE), Zoho en propose 5 (dont "Waiting for input") — écart volontaire, jugé non significatif.
- **Pas d'édition ni de suppression** d'une Tâche/Réunion CRM une fois créée (seul le statut d'une Tâche change). Zoho permet de tout modifier après coup.
- **Pas de réassignation** de Lead/Contact/Deal à un autre utilisateur depuis l'interface (le champ `assigneAId` existe et est utilisé, mais rien ne le modifie après la création/conversion).
- **Pas de champs personnalisés** sur Lead/Contact/Deal/Compte — le modèle est fixe, contrairement à Zoho qui permet d'en ajouter à volonté.

## 4. Zoho Books — Documents financiers

Construit le 2026-09-06 à partir de la page d'aide Zoho Books "Documents" (upload de reçus/factures, autoscan, dossiers, rattachement aux transactions, rapprochement bancaire assisté) : boîte de réception, classeurs, rattachement d'un fichier à une Facture ou un Paiement, métadonnées (fournisseur/montant/date) — voir `src/db/schema.ts` (`documentFinancier`/`classeurDocumentFinancier`), `src/lib/actions/document-financier.ts`, `src/app/app/comptabilite/documents/`.

Deux capacités réelles de Zoho Books n'ont pas d'équivalent, faute d'infrastructure déjà configurée dans Vertex One — décision volontaire de ne pas construire une version factice :

- **Autoscan (OCR)** : Zoho extrait automatiquement date/montant/fournisseur d'un reçu scanné. Nécessiterait de choisir et configurer un vrai fournisseur d'extraction (API de vision/OCR) — aucun n'est branché aujourd'hui. En attendant, ces champs se saisissent à la main sur chaque document.
- **Adresse email dédiée pour recevoir les reçus par email** : nécessiterait une infrastructure d'email entrant (parsing de webhook), que Vertex One n'a pas — seul l'envoi sortant (Resend) existe. Le dépôt de fichier se fait donc uniquement par upload manuel dans l'interface.

Autres écarts, moins prioritaires :
- Un document ne peut se rattacher qu'à une Facture ou un Paiement existants (côté Ventes) — pas encore à une Dépense/Facture fournisseur (voir section 5, construites depuis, mais pas encore branchées à ce module Documents).
- Pas de permissions par classeur (Zoho permet de restreindre un classeur à certains utilisateurs) — tout Admin/Manager avec accès à Comptabilité voit tous les classeurs.
- Pas de portail client pour visualiser les documents partagés (Vertex One n'a pas de portail client du tout).
- Pas de suggestion automatique de rapprochement entre un document et une transaction existante (Zoho propose des "matching transactions") — le rattachement reste un choix manuel dans un menu déroulant.

## 5. Zoho Books — Cycle Achats (Fournisseurs/Dépenses)

Construit le 2026-09-07 à partir de `zoho-books-full-spec.md` (cahier des charges complet fourni par l'utilisateur). Première tranche du cycle Achats — le pendant du cycle Ventes côté fournisseurs : **Fournisseurs** (`fournisseur`) et **Dépenses** (`depense`, saisie rapide "hors cycle bill complet" qui génère immédiatement ses écritures comptables). Module "Achats" dédié dans la sidebar (`src/app/app/achats/`), permission `ACHATS` propre (voir `src/lib/permissions.ts`).

**Reste à construire pour ce cycle** (tranches séparées à venir, un sujet financier sensible traité étape par étape plutôt qu'en un seul bloc) :
- Bons de commande fournisseur (Purchase Orders)
- Factures fournisseur (Bills) — la vraie dette fournisseur avec échéance, contrairement à la Dépense qui suppose un paiement immédiat
- Paiements effectués (Payments Made) — règlement d'une ou plusieurs Bills
- Avoirs fournisseur (Vendor Credits)

**Extensions Ventes non construites** (même spec) : Bons de commande client (Sales Orders), Factures récurrentes, Factures d'acompte (Retainer), Avoirs clients (Credit Notes), Reçus de vente (Sales Receipts).

**Items** — catalogue Produits/Tarifs (biens/services, prix vente/achat, suivi de stock optionnel) : les lignes de Devis/Factures/Dépenses restent en texte libre, sans référentiel réutilisable.

**Hors périmètre pour l'instant, chantiers structurellement différents** (pas de simples extensions) :
- Transaction Approval (workflow d'approbation multi-niveaux)
- Customer Portal / Vendor Portal (surface authentifiée externe)
- Time Tracking/Timesheet (Vertex One a déjà un modèle de Tâches différent, propre à ses Projets)
- Custom Modules/Blueprints
- Multi-devises, Emplacements (Locations), Budgets, Immobilisations, Verrouillage de période
- Rapports avancés (Ventes/Achats/Stock/Balances âgées) au-delà du Bilan/Compte de résultat déjà existant
- Import/Export en masse, API publique/Webhooks, passerelles de paiement autres que NotchPay

## Quand y revenir

Ce fichier est une note vivante : à mettre à jour (ajouter/rayer une ligne) plutôt que d'ouvrir un nouveau document à chaque fois qu'un manque est identifié, jusqu'à ce qu'un vrai chantier soit lancé sur l'un de ces points.
