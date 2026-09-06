# CRM — ce qui reste à construire après la commercialisation

*Document de suivi, pas une spécification technique — à date du 2026-09-06.*

Le CRM de Vertex One (Leads/Contacts/Comptes/Deals + Accueil) est fonctionnel et vendable en l'état. Cette page recense ce qui a été identifié comme manquant par rapport à Zoho CRM pendant sa reconstruction, pour ne rien perdre en attendant d'y revenir. Ce n'est pas un gel : rien n'empêche de reprendre l'un de ces points avant la commercialisation si un besoin se présente — cette page sert de mémoire, pas de barrière.

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

## Quand y revenir

Ce fichier est une note vivante : à mettre à jour (ajouter/rayer une ligne) plutôt que d'ouvrir un nouveau document à chaque fois qu'un manque est identifié, jusqu'à ce qu'un vrai chantier soit lancé sur l'un de ces points.
