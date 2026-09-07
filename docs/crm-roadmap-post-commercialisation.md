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

## 5. Zoho Books — Cycle Achats (Fournisseurs/Dépenses/Factures fournisseur/Paiements effectués)

Construit le 2026-09-07 à partir de `zoho-books-full-spec.md` (cahier des charges complet fourni par l'utilisateur), en trois tranches vérifiées séparément (schéma → migration → écritures comptables → actions → interface → tests RLS → parcours navigateur réel) — cycle Achats désormais complet de bout en bout :

1. **Fournisseurs** (`fournisseur`) et **Dépenses** (`depense`) — saisie rapide "hors cycle bill complet" qui génère immédiatement ses écritures comptables.
2. **Factures fournisseur** (`factureFournisseur`/`ligneFactureFournisseur`, Bills) — la vraie dette fournisseur avec échéance, numéro DU FOURNISSEUR (texte libre, jamais généré par nous, à l'inverse de Facture client) — et **Paiements effectués** (`paiementEffectue`, Payments Made), réglés intégralement en une fois (même simplification que `marquerFacturePayee()` côté client, qui ne gère pas non plus le paiement partiel malgré `PARTIELLEMENT_PAYEE` déjà dans son enum).
3. **Bons de commande fournisseur** (`bonCommandeAchat`/`ligneBonCommandeAchat`, Purchase Orders) — NOTRE numéro (`genererNumeroBonCommandeAchat`, même mécanisme atomique que Devis/Facture), aucune écriture comptable générée à la création (hors bilan tant que non facturé, comme chez Zoho Books) ; conversion en Facture fournisseur en un clic (copie des lignes, comme `accepterDevis()` côté Ventes) — et **Avoirs fournisseur** (`avoirFournisseur`, Vendor Credits), miroir exact de `annulerFacture()`/`avoirFacture` côté client (même simplification assumée : pas de contre-passation des écritures d'origine).

Module "Achats" dédié dans la sidebar (`src/app/app/achats/`), permission `ACHATS` propre (voir `src/lib/permissions.ts`). Une seule catégorie de charge par Dépense/Facture fournisseur/Bon de commande (pas de compte par ligne), faute de catalogue Produits/Tarifs (voir ci-dessous).

**Écarts volontaires, connus** :
- Paiement partiel d'une Facture fournisseur (`PARTIELLEMENT_PAYEE` existe dans l'enum, non implémenté — même écart que côté Facture client).
- Un Bon de commande annulé ou déjà facturé ne peut pas être modifié/réédité (pas de retour en BROUILLON).

**Extensions Ventes de la spec Zoho Books : toutes construites** (Bons de commande client, Factures récurrentes, Reçus de vente, Factures d'acompte — voir sous-sections ci-dessous). Correction : les **Avoirs clients (Credit Notes) existaient déjà** depuis le Palier 1 (`avoirFacture`/`annulerFacture()`) — erreur de cette page corrigée le 2026-09-07, ne pas les reconstruire.

### Bons de commande client (Sales Orders) — construit le 2026-09-07

Miroir exact du Bon de commande fournisseur côté Ventes : `bonCommandeVente`/`ligneBonCommandeVente`, NOTRE numéro (`genererNumeroBonCommandeVente`, même compteur atomique que Devis/Facture/BC fournisseur), créé depuis la fiche Deal (`src/app/app/deals/[id]/page.tsx`, bouton "Créer un bon de commande" à côté de "Créer un devis"). Aucune écriture comptable ni mouvement de stock à la création (engagement, pas encore une vente réalisée) — les deux sont générés à la conversion en Facture (`convertirBonCommandeVenteEnFacture()`, `src/lib/actions/bon-commande-vente.ts`), qui copie les lignes (comme `accepterDevis()`), décrémente le stock des produits suivis (`decrementerStockVente()`) et appelle `genererEcrituresFactureEmise()`. Même vérification NIU obligatoire que `creerDevis()` avant toute création, puisque ce chemin mène directement à une Facture sans passer par un Devis.

Testé : fuite RLS entre deux entreprises fictives (`tests/ventes-bons-commande-fuite-rls.test.ts`), logique de conversion + décrément de stock + équilibre des écritures + non-reconversion d'un BC déjà FACTURE/ANNULE (`tests/ventes-conversion-bon-commande.test.ts`), parcours complet vérifié dans un vrai navigateur (Lead → Contact/Deal → Produit avec stock → Bon de commande → conversion en Facture → stock décrémenté).

Écart volontaire, connu : comme le Bon de commande fournisseur, un Bon de commande client annulé ou déjà facturé ne peut pas être modifié/réédité (pas de retour en BROUILLON).

### Factures récurrentes (Recurring Invoices) — construit le 2026-09-07

Un modèle sans numéro propre (`factureRecurrente`/`ligneFactureRecurrente` — ce n'est pas un document financier, seulement un générateur), créé depuis la fiche Deal (bouton "Créer une facture récurrente"), qui produit une vraie Facture numérotée (`genererNumeroFacture()`, même série que toute autre facture) à chaque échéance atteinte. Génération assurée par le worker graphile-worker existant (`crontab`, `0 5 * * * verifier-factures-recurrentes`), même patron cron-dispatcher + job-par-entreprise que la relance de factures en retard : `verifier-factures-recurrentes.ts` liste les entreprises et distribue un job `facturer-recurrente-entreprise` par entreprise, qui appelle `genererFacturesRecurrentesDues()` (`src/lib/facturation/recurrence.ts`) via `avecEntreprise()`. Chaque génération copie les lignes, décrémente le stock des produits suivis (`decrementerStockVente()`) et appelle `genererEcrituresFactureEmise()`, exactement comme la conversion d'un Bon de commande client. Même vérification NIU obligatoire qu'à la création d'un Devis/Bon de commande — si le NIU est absent au moment d'un passage du worker, la génération de ce passage est différée sans avancer la date d'échéance (le prochain passage quotidien retente automatiquement).

`prochaineDateGeneration` avance toujours depuis la date prévue elle-même (jamais depuis "aujourd'hui"), pour ne jamais dériver si le worker tourne en retard un jour donné. Le statut bascule automatiquement à TERMINE dès que la prochaine échéance calculée dépasserait `dateFin` (optionnelle). Actions de gestion depuis la fiche Deal : mettre en pause, réactiver, arrêter définitivement (`src/lib/actions/facture-recurrente.ts`).

Testé : fuite RLS entre deux entreprises fictives (`tests/ventes-factures-recurrentes-fuite-rls.test.ts`), logique de génération complète — création de facture, décrément de stock, avance de date, bascule TERMINE, modèle pas encore dû ou EN_PAUSE ignoré, différé sans NIU (`tests/ventes-generation-factures-recurrentes.test.ts`), parcours complet vérifié dans un vrai navigateur (Lead → Contact/Deal → modèle récurrent → génération déclenchée → Facture visible).

Écarts volontaires, connus :

- Une seule fréquence par modèle parmi MENSUEL/TRIMESTRIEL/ANNUEL (pas de fréquence personnalisée ni hebdomadaire, jugées peu pertinentes pour des contrats de service au Cameroun).
- Un modèle réactivé après une pause ne rattrape jamais plusieurs échéances manquées d'un coup — une seule Facture est générée par passage quotidien du worker, comme n'importe quel autre modèle (voir commentaire de `reactiverFactureRecurrente()`).
- Pas d'aperçu de la prochaine Facture avant génération, ni de modification des lignes d'un modèle après sa création (il faut l'arrêter et en recréer un autre).

### Reçus de vente (Sales Receipts) — construit le 2026-09-07

Une vente au comptant, encaissée intégralement à la création (`recuVente`/`ligneRecuVente`), créée depuis la fiche Deal (bouton "Créer un reçu de vente") — pas d'état brouillon, contrairement au Devis/Bon de commande. Numérotation propre (`genererNumeroRecuVente()`, préfixe "REC"), jamais mêlée à celle des Factures. Différence structurelle clé avec toutes les autres extensions Ventes : un Reçu de vente ne passe jamais par le compte Clients (411000) — `genererEcrituresRecuVente()` (`src/lib/comptabilite/ecritures.ts`) débite directement la trésorerie (Caisse 571000 pour espèces/manuel, Banque 512000 pour Mobile Money/virement, même règle que `genererEcrituresDepense()` côté Achats) puisque le règlement est immédiat, jamais une créance en attente. Décrémente le stock des produits suivis (`decrementerStockVente()`) comme toute autre vente. Même vérification NIU obligatoire qu'à la création d'un Devis.

Testé : fuite RLS entre deux entreprises fictives (`tests/ventes-recus-vente-fuite-rls.test.ts`), logique complète — numérotation, décrément de stock, bon compte de trésorerie selon le moyen de paiement, non-réutilisation d'un Reçu déjà ANNULE (`tests/ventes-recu-vente-logique.test.ts`), parcours complet vérifié dans un vrai navigateur (Lead → Contact/Deal → Produit avec stock → Reçu de vente → annulation).

Écart volontaire, connu : comme les autres documents financiers de ce module, l'annulation d'un Reçu de vente ne contre-passe jamais les écritures d'origine (même simplification que `annulerFacture()`/`annulerBonCommandeAchat()`).

### Factures d'acompte (Retainer Invoices) — construit le 2026-09-07

Une avance demandée avant livraison (`factureAcompte`, pas de lignes ni de TVA — une avance n'est jamais du chiffre d'affaires tant qu'elle n'a pas été appliquée sur une vraie Facture, qui porte sa propre ventilation HT/TVA). Nouveau compte SYSCOHADA ajouté au référentiel global : **419100 "Clients, avances et acomptes reçus"** (`src/lib/comptabilite/plan-comptable-syscohada.ts` — un compte de dette envers le client, jamais une créance ni un produit).

Cycle de vie en trois étapes, chacune avec sa propre écriture (ou aucune) :

1. **Création** (`creerFactureAcompte`) — EMISE, numéro propre (`genererNumeroFactureAcompte`, préfixe "ACO"), aucune écriture (comme un Devis).
2. **Encaissement** (`enregistrerPaiementFactureAcompte`) — EMISE → PAYEE, `genererEcrituresPaiementAcompte()` débite la trésorerie et crédite 419100 (jamais 706000/443200).
3. **Application sur une Facture** (`appliquerAcompteSurFacture`) — `genererEcrituresApplicationAcompte()` débite 419100 et crédite 411000 (jamais la trésorerie, déjà encaissée à l'étape précédente), marque la Facture ciblée PAYEE, décrémente `montantRestant` de l'acompte et bascule à APPLIQUEE une fois ce solde à zéro (un acompte peut couvrir plusieurs petites Factures l'une après l'autre tant qu'il reste du solde).

**Simplification volontaire, structurante** : une application n'est autorisée que si `montantRestant` couvre **intégralement** le montant TTC de la Facture ciblée (`montantRestant >= facture.montantTTC`) — jamais de paiement partiel d'une Facture, cohérent avec le reste du produit (`PARTIELLEMENT_PAYEE` existe dans l'enum `statutFacture` depuis le Palier 1 mais n'a jamais été implémenté, y compris pour les paiements en espèces normaux). Construire un vrai paiement partiel aurait nécessité d'ajouter un suivi `montantPaye`/`montantRestant` sur `facture` elle-même — un chantier transverse plus large que cette seule tranche, à réévaluer si un besoin réel de paiement partiel se présente un jour (voir section 3).

Autres écarts volontaires, connus :

- Annulation (`annulerFactureAcompte`) possible uniquement depuis EMISE — une fois encaissé (PAYEE), annuler nécessiterait un vrai remboursement, hors périmètre.
- Pas de génération de PDF/envoi par email pour une Facture d'acompte (contrairement au Devis/Facture) — un document interne au produit pour l'instant, jamais transmis tel quel au client.

Testé : fuite RLS entre deux entreprises fictives (`tests/ventes-factures-acompte-fuite-rls.test.ts`), logique complète — écritures d'encaissement (419100, jamais 706000), application sur plusieurs Factures successives jusqu'à épuisement du solde, garde applicative contre une Facture trop grande, non-annulation après encaissement (`tests/ventes-facture-acompte-logique.test.ts`), parcours complet vérifié dans un vrai navigateur (Lead → Contact/Deal → Facture d'acompte → encaissement → application sur une Facture existante).

## 6. Zoho Books — Catalogue Produits/Tarifs (Items)

Construit le 2026-09-07. `produit` (BIEN/SERVICE, prix vente/achat, `suiviStock` optionnel — un SERVICE n'a jamais de stock) — module "Produits" dédié (`src/app/app/produits/`), permission `PRODUITS` (référentiel partagé Ventes/Achats, portée toujours TOUT).

**Intégré côté Ventes** (une ligne de Devis peut piocher dans le catalogue, sans obligation — le texte libre reste toujours possible) :
- `ligneDevis`/`ligneFacture` portent un `produitId` nullable ; choisir un produit dans le formulaire de Devis pré-remplit désignation/prix.
- Mouvement de stock réel à l'acceptation d'un Devis (`decrementerStockVente()`, `src/lib/produits/stock.ts`) : une vente facturée diminue le stock des BIEN suivis, jamais au stade Devis (simple intention).

**Intégré côté Achats** (échange du 2026-09-07, même après-midi) — mouvement inverse symétrique :
- `ligneFactureFournisseur`/`ligneBonCommandeAchat` portent un `produitId` nullable ; choisir un produit dans le formulaire de Facture fournisseur ou de Bon de commande pré-remplit désignation/prix d'achat.
- `incrementerStockAchat()` augmente le stock à la création d'une Facture fournisseur (directe ou par conversion d'un Bon de commande) — jamais à la création du Bon de commande lui-même (hors bilan tant que non facturé).
- Aucun blocage si le stock devient négatif après une vente (comme Zoho, qui ne bloque pas, se contente de suivre le nombre).

**Pas encore construit** :
- Pas de Listes de prix (Price Lists, tarification différenciée par client/segment).
- Pas d'alerte de réapprovisionnement (Reorder Point/Preferred Vendor).
- Pas d'ajustement d'inventaire manuel (Inventory Adjustments) — seule la vente/l'achat facturé mouvemente le stock.

**Hors périmètre pour l'instant, chantiers structurellement différents** (pas de simples extensions) :
- Transaction Approval (workflow d'approbation multi-niveaux)
- Customer Portal / Vendor Portal (surface authentifiée externe)
- Custom Modules/Blueprints
- Multi-devises, Emplacements (Locations), Budgets, Immobilisations, Verrouillage de période
- Rapports avancés (Ventes/Achats/Stock/Balances âgées) au-delà du Bilan/Compte de résultat déjà existant
- Import/Export en masse, API publique/Webhooks, passerelles de paiement autres que NotchPay

## 7. Découplage Books/CRM — construit le 2026-09-07

Défaut architectural réel trouvé et corrigé (voir CLAUDE.md, section "Indépendance des modules") : les 6 tables de documents Ventes (Devis/Factures/Bons de commande/Factures récurrentes/Reçus de vente/Factures d'acompte) avaient un `dealId` **obligatoire**, rendant Facturation/Books techniquement inutilisable sans être passé par le pipeline CRM au préalable — contradiction directe avec le principe que chaque module de Vertex One doit rester vendable et utilisable individuellement.

Corrigé en 8 tranches (patron expand → backfill → migrate → contract, chacune vérifiée séparément : schéma → logique métier → UI → tests → migrations 0044 à 0047) :

- `contactId` (obligatoire) et `compteId` (dénormalisé, optionnel) ajoutés directement sur les 6 tables — `dealId` devient optionnel, renseigné seulement quand le document vient réellement du CRM.
- `assigneAId` ajouté directement sur les 6 tables — la portée (`idsVisibles(..., "FACTURATION")`) se calcule désormais directement dessus, comme le fait déjà le module Achats, sans plus jamais passer par une jointure Deal.
- Nouveau helper partagé `src/lib/facturation/client-document.ts` : `resoudreClientVente()` (résout le client via `dealId` ou `contactId`, utilisé par les 5 actions de création) et `memeClientVente()` (garde-fou de l'application d'un acompte, remplace l'ancienne comparaison sur `dealId`).
- Les 5 boutons de création (Devis/Bon de commande/Facture récurrente/Reçu de vente/Facture d'acompte) apparaissent maintenant aussi sur la fiche Contact (`?contactId=`), pas seulement sur la fiche Deal (`?dealId=`) — Books peut émettre une facture sans jamais toucher au CRM.
- `/app/facturation` intègre directement les composants de gestion (conversion BC, pause/reprise/arrêt de récurrence, annulation de reçu, application d'acompte) plutôt que de renvoyer vers `/app/deals/{id}`, qui n'existe pas pour un document créé sans Deal.

Vérifié : suite complète (128 tests, dont de nouveaux tests dédiés à `resoudreClientVente()`/`memeClientVente()`), et les deux parcours en navigateur réel — Lead → Deal → Devis → Facture (historique, toujours vert, zéro régression) et Contact seul → Devis → Facture sans jamais passer par `/app/deals` (nouveau, l'objectif même de ce chantier).

## 8. Suivi des heures (Time Tracking) — construit le 2026-09-07

Catégorie "Suivi des heures" de l'arborescence Zoho Books (échange du 2026-09-07, "CONSTRUIT CELA") — jusque-là volontairement omise de FACO faute de page équivalente. Construit en s'appuyant sur le module Projets existant (Palier 2) plutôt qu'en dupliquant un second concept de "Projet" propre à Books, conformément à la note laissée en section 1 ("vérifier un jour si les deux devraient converger").

- Nouvelle table `entreeTemps` : une entrée de temps sur un Projet (obligatoire) et éventuellement une Tâche précise (optionnelle), enregistrée par un utilisateur — `facturable`/`tauxHoraire` déterminent si et comment elle alimente une Facture. Module de permission réutilisé : `PROJETS` (comme Tâche), pas de nouveau module dédié.
- `projet.tauxHoraireParDefaut` (nullable) pré-remplit le formulaire d'une nouvelle entrée, jamais imposé — chaque entrée garde son propre taux, modifiable au cas par cas.
- Section "Feuille de temps" ajoutée à la fiche Projet existante (`src/app/app/projets/[id]/page.tsx`) : liste des entrées, formulaire d'ajout, suppression tant qu'une entrée n'est pas facturée. Nouvelle page transverse `/app/projets/feuille-temps` (même patron que `/app/projets/mes-taches`), portée filtrée directement sur `entreeTemps.utilisateurId` (comme le fait déjà le module Achats sur `assigneAId`, jamais via une jointure).
- `genererFactureDepuisHeures()` (`src/lib/actions/entree-temps.ts`) génère une Facture à partir de **toutes** les entrées facturables non encore facturées d'un Projet, en une fois. Client retrouvé via `projet.dossierId → dossier.contactId` (Projet n'a pas de `contactId` propre) et `resoudreClientVente()` (voir section 7) — une Facture générée depuis les heures n'a donc jamais de `dealId`, exactement comme un Devis créé depuis un Contact directement. Une ligne de Facture par entrée ; `entreeTemps.factureId` renseigné empêche toute double-facturation.
- "Projets" et "Feuille de temps" ajoutés comme raccourcis dans FACO > Suivi des heures (module `PROJETS`), en plus de l'entrée racine "Projets" déjà existante — même principe de raccourci dupliqué que Clients/Documents/Campagnes ailleurs dans la sidebar.

Écarts volontaires, connus :
- Pas de sélection ligne par ligne des entrées à facturer (comme le paiement partiel, jamais implémenté ailleurs dans ce produit) — toujours la totalité du non-facturé d'un Projet en une fois.
- Aucun message d'erreur affiché si la génération échoue silencieusement (NIU manquant, Dossier introuvable) — bouton simple sans formulaire, même simplification que d'autres actions de bascule de statut de ce produit (ex. `annulerBonCommandeVente()`).
- Pas de minuteur (start/stop) ni d'application mobile de pointage — saisie manuelle a posteriori uniquement.

Testé : fuite RLS entre deux entreprises fictives (`tests/suivi-heures-fuite-rls.test.ts`), logique complète — génération correcte, exclusion des entrées non facturables, non-double-facturation, garde contre la suppression d'une entrée déjà facturée (`tests/suivi-heures-logique.test.ts`), parcours complet vérifié dans un vrai navigateur (Projet → enregistrement d'heures → génération d'une Facture → Feuille de temps transverse).

## 9. Tableau de bord d'accueil FACO — construit le 2026-09-07

Échange du 2026-09-07, "l'accueil de FACO(books) a un tableau de bord" — l'utilisateur a collé le contenu exact de l'accueil Zoho Books (comptes clients/fournisseurs, flux de trésorerie, revenu et dépense, dépenses principales, projets à suivre, banque et cartes de crédit). `/app/facturation` affichait jusque-là un simple `<h1>Facturation</h1>` avant la liste des documents.

- `src/lib/facturation/tableau-de-bord.ts` (`recupererTableauDeBordFaco()`) — chaque section respecte sa propre permission/portée indépendamment des autres, pas un blocage en tout-ou-rien : comptes clients toujours visible (dérivé des Factures déjà visibles pour ce rôle) ; comptes fournisseurs/dépenses principales gated par `ACHATS`+portée ; flux de trésorerie/revenu-dépense gated par `COMPTABILITE`+`disponible(..., "COMPTABILITE_COMPLETE")` (plan Business uniquement) ; projets à suivre gated par `PROJETS`+portée.
- `calculerBalance()` (`src/lib/comptabilite/etats-financiers.ts`) étend d'un paramètre optionnel `dateDebut` pour isoler les mouvements de l'exercice en cours, sans casser son unique appelant existant (Bilan/Compte de résultat à date).
- `src/app/app/facturation/tableau-de-bord.tsx` — présentation en tuiles (patron déjà utilisé par l'accueil CRM).
- FACO gagne un `hrefAccueil` (`/app/facturation`) dans la sidebar : cliquer le libellé du module ouvre désormais directement ce tableau de bord, comme CRM le fait déjà vers `/app/crm`.

Écarts volontaires, connus (jamais de fonctionnalité fabriquée sans donnée réelle derrière) :
- "Votre logo"/"Démarrage"/"Mises à jour récentes" (chrome d'onboarding Zoho) — non construits, aucune donnée réelle possible derrière.
- Graphiques mensuels (Flux de trésorerie/Revenu et dépense) — réduits à des totaux sur l'exercice en cours : ce projet n'a aucune bibliothèque de graphiques (voir section 6, "Rapports avancés... hors périmètre"). Les chiffres restent réels, seule la visualisation mois par mois est différée.
- "Banque et cartes de crédit" renvoie vers le Rapprochement bancaire déjà construit (import de relevé CSV, Palier 4) avec un texte explicite — jamais une vraie connexion bancaire automatique, aucun agrégateur bancaire n'étant configuré.

Testé : `tsc`/`eslint`/`npm test` (132 tests) verts, parcours vérifié dans un vrai navigateur (inscription, upgrade Business, affichage de toutes les sections, navigation FACO → tableau de bord depuis la sidebar).

## 10. Minuteur démarrer/arrêter + vue Semaine — construit le 2026-09-07

Échange du 2026-09-07 — l'utilisateur a comparé la Suivi des heures (section 8) à la vraie feuille de temps Zoho Books ("Créer votre première entrée de temps... Démarrez et arrêtez le minuteur pour enregistrer les heures... Enregistrer les heures pour une seule journée ou une semaine entière") et demandé les deux manques : un minuteur démarrer/arrêter, et une bascule "Afficher par : Jour/Semaine".

- Nouvelle table `minuteurActif` : une ligne = un minuteur EN COURS pour un utilisateur, supprimée dès l'arrêt (qui crée alors la vraie `entreeTemps`) ou l'annulation. `uniqueIndex` sur `utilisateurId` — un seul minuteur actif par utilisateur, contrainte posée en base (pas seulement vérifiée en application) contre une course concurrente sur un double démarrage.
- `src/lib/actions/minuteur.ts` : `demarrerMinuteur()` refuse (erreur affichée, pas d'écrasement silencieux) si un minuteur est déjà en cours pour cet utilisateur ; `arreterMinuteur()` calcule la durée écoulée depuis `demarreLe` (plancher 0.01h pour ne jamais violer la contrainte positive sur un arrêt quasi immédiat) et crée l'`entreeTemps` correspondante (`facturable: true`, taux repris de `projet.tauxHoraireParDefaut`, aucune ressaisie à l'arrêt — même simplification que `creerEntreeTemps`) ; `annulerMinuteur()` supprime sans rien créer.
- Visible uniquement sur les deux pages Feuille de temps existantes (fiche Projet + page transverse `/app/projets/feuille-temps`), **pas un widget global dans la sidebar** — décision délibérée, validée avec l'utilisateur, pour ne pas ajouter de requête `avecEntreprise()` (donc une transaction) à chaque navigation `/app/*`, cohérent avec le choix déjà fait dans `layout.tsx` (une seule requête simple, sans transaction, par souci de latence Neon documentée plus haut dans ce fichier CLAUDE.md). Le minuteur continue de tourner côté serveur même hors de ces deux pages ; seul l'affichage y est limité.
- `src/app/app/projets/feuille-temps/vue-feuille-temps.tsx` : bascule "Afficher par : Jour/Semaine" — le mode Jour délègue au rendu existant (aucune régression), le mode Semaine est une grille en **lecture seule** (agrégation des heures par ligne/jour, navigation semaine précédente/suivante) — jamais une saisie cellule par cellule, chantier disproportionné par rapport à la demande, même discipline que le tableau de bord FACO (section 9).

Écarts volontaires, connus :
- Pas de ressaisie note/tâche/taux à l'arrêt du minuteur — hérités du démarrage, jamais modifiables entre-temps.
- Vue Semaine en lecture seule, aucune édition inline.
- Pas d'app mobile de pointage (mentionnée dans l'écran Zoho collé par l'utilisateur) — hors périmètre de ce produit.

Testé : `tsc`/`eslint`/`vitest` (138 tests, dont `tests/minuteur-logique.test.ts` et `tests/minuteur-fuite-rls.test.ts`) verts, parcours complet vérifié dans un vrai navigateur (démarrage sur la fiche Projet, visible et arrêtable depuis la page transverse — preuve que l'état est bien côté serveur —, entrée créée, grille Semaine correcte, annulation sans création d'entrée).

## 11. FACO > Ventes : les 8 onglets exacts de Zoho Books — construit le 2026-09-07

Échange du 2026-09-07 — l'utilisateur a listé les 8 onglets exacts attendus sous Ventes (Clients, Devis, Commandes client, Factures, Tickets de vente, Factures périodiques, Paiements reçus, Factures d'avoir), remplaçant l'unique raccourci "Facturation" qui existait jusque-là.

- `/app/facturation` reste une seule page listant tous les documents Ventes en sections (pas une page dédiée par type de document) : les 7 onglets (hors Clients) pointent donc vers une ancre (`#devis`, `#commandes-client`, `#factures`, `#tickets-de-vente`, `#factures-periodiques`, `#paiements-recus`, `#factures-avoir`) plutôt qu'une nouvelle route.
- "Paiements reçus" et "Factures d'avoir" correspondent aux tables `paiement`/`avoirFacture`, déjà construites et actives au Palier 1 (encaissement manuel, annulation de facture) mais jusque-là visibles uniquement depuis la fiche Facture (`/app/facturation/factures/[id]`) — elles gagnent ici leur première liste agrégée, tous documents confondus. Ni l'une ni l'autre ne porte de `assigneAId` propre (toujours rattachées à une Facture précise, jamais un document Ventes autonome) : la portée se déduit de la Facture visible correspondante.

Testé : `tsc`/`eslint`/`vitest` (138 tests) verts, parcours réel en navigateur (les 8 liens de la sidebar naviguent vers la bonne ancre, les deux nouvelles sections affichent les bonnes données pour un Paiement et un Avoir insérés directement en base).

## Quand y revenir

Ce fichier est une note vivante : à mettre à jour (ajouter/rayer une ligne) plutôt que d'ouvrir un nouveau document à chaque fois qu'un manque est identifié, jusqu'à ce qu'un vrai chantier soit lancé sur l'un de ces points.
