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

## 12. FACO > Achats : 6 des 8 onglets Zoho Books — construit le 2026-09-07

Suite directe de la section 11 (même échange, "continuer FACO/Books") — même traitement pour Achats : remplace l'unique raccourci "Achats" par 6 onglets pointant vers une ancre de `/app/achats`.

- "Paiements effectués" et "Avoirs fournisseur" (tables `paiementEffectue`/`avoirFournisseur`, déjà actives depuis le cycle Achats — encaissement manuel côté `marquerFactureFournisseurPayee`/annulation côté `annulerFactureFournisseur`) gagnent leur première liste agrégée, exact miroir de Paiements reçus/Factures d'avoir côté Ventes.
- **"Dépenses périodiques" et "Factures fournisseurs périodiques" (2 des 8 onglets Zoho) n'ont aucun équivalent construit** — pas de récurrence côté Achats, contrairement à `factureRecurrente` côté Ventes. Volontairement omis de la sidebar plutôt qu'un lien mort ; à construire un jour sur le même patron que `factureRecurrente`/`genererFacturesRecurrentesDues()` si un besoin réel se présente.

**Bug réel trouvé et corrigé en cours de route** : `NavGroup`/`NavLink` (`src/app/app/nav-link.tsx`) comparaient `pathname` (qui ne contient jamais de fragment `#`, `usePathname()` l'exclut toujours) à des `href` complets avec ancre (`/app/facturation#devis`). Résultat : le groupe FACO se repliait tout seul dès qu'on naviguait vers un onglet à ancre d'une catégorie différente de celle de `hrefAccueil` — passé inaperçu pour Ventes (dont tous les onglets pointent justement vers la page `hrefAccueil` elle-même, donc jamais de changement réel de route), mais reproductible immédiatement en testant Achats. Corrigé en comparant uniquement la partie avant `#` dans les deux composants.

Testé : `tsc`/`eslint`/`vitest` verts, parcours réel en navigateur (les 6 liens Achats naviguent vers la bonne ancre, un enchaînement Ventes → Achats sans recliquer sur "FACO" confirme que le groupe reste déplié).

## 13. FACO > Comptable : Plan comptable — construit le 2026-09-07

Suite directe des sections 11-12 (même échange) — sur les 6 onglets Zoho Books > Comptable (Journaux manuels, Mise à jour en bloc, Ajustements de la devise, Plan comptable, Budgets, Verrouillage de transactions), seul un a un équivalent bon marché à construire immédiatement :

- **Plan comptable** (nouveau) — `src/app/app/comptabilite/plan-comptable/page.tsx`, lecture seule sur `compteComptable` (référentiel SYSCOHADA **global**, partagé entre toutes les entreprises, sans `entrepriseId` ni RLS — voir schema.ts) groupé par classe, avec le solde propre à l'entreprise connectée (`calculerBalance()`). Jamais de création de compte personnalisé : contrairement à Zoho, ajouter un compte engagerait un changement de schéma plus large (compteComptable devrait alors distinguer un compte global d'un compte propre à une entreprise), pas fait sans besoin réel.
- **Journal** — pas une nouvelle page, juste un raccourci (`#journal`) vers le journal des écritures déjà affiché sur `/app/comptabilite`.

**Les 4 autres onglets restent des lacunes réelles, pas construites** (contrairement à Plan comptable, ce sont de vraies fonctionnalités neuves, pas de la donnée déjà là à afficher) :
- Journaux manuels — aucune écriture n'est aujourd'hui saisissable à la main, `ecritureComptable` n'est alimentée qu'automatiquement (facture émise, paiement, dépense...).
- Budgets — aucune table, aucun suivi budget/réalisé.
- Verrouillage de transactions — aucune date de clôture empêchant la modification d'une période déjà close.
- Mise à jour en bloc / Ajustements de la devise — non pertinents pour ce produit (devise unique XAF, pas de multi-devise) ou faible valeur perçue pour une petite entreprise ; à ne construire que sur demande explicite.

Testé : `tsc`/`eslint`/`vitest` verts, parcours réel en navigateur (Journal et Plan comptable naviguent correctement, les comptes SYSCOHADA s'affichent groupés par classe avec leur solde).

## 14. FACO > Comptable : Journaux manuels — construit le 2026-09-07

Suite directe de la section 13 (même échange) — la première des 3 vraies lacunes de la catégorie Comptable, choisie par l'utilisateur comme la plus utile/la moins risquée à construire immédiatement.

- Nouvelle table `journalManuel` (en-tête : numéro `JM-AAAA-NNNNNN`, libellé, date, auteur) + colonne `journalManuelId` sur `ecritureComptable` (même patron "référence sans FK stricte" que `factureId`/`paiementId`/`depenseId`, voir schema.ts) pour ses lignes de débit/crédit.
- `creerJournalManuel()` (`src/lib/actions/journal-manuel.ts`) impose deux gardes avant tout insert : chaque ligne porte un débit OU un crédit (jamais les deux, jamais aucun), et le total débit doit égaler le total crédit et être strictement positif — un journal déséquilibré ne peut jamais être enregistré. `src/app/app/comptabilite/journaux-manuels/formulaire-journal-manuel.tsx` calcule le même équilibre côté client en direct (indicateur vert/orange), désactivant le bouton "Enregistrer" tant que ce n'est pas équilibré — la garde serveur reste la seule autorité réelle, le client n'est qu'un confort.
- `genererNumeroJournalManuel()` (`src/lib/facturation/numerotation.ts`, réutilise le compteur atomique déjà éprouvé pour Devis/Factures/Bons de commande, nouveau `entreprise.compteurJournauxManuels`).
- Réservé à l'Administrateur, comme le reste du module Comptabilité (`peut(role, "COMPTABILITE", "CREER")`) et gated `COMPTABILITE_COMPLETE` (plan Business).

Restent des lacunes réelles, non construites (voir section 13) : Budgets, Verrouillage de transactions, Mise à jour en bloc, Ajustements de la devise.

Testé : `tsc`/`eslint`/`vitest` (`tests/journal-manuel-logique.test.ts`, `tests/journal-manuel-fuite-rls.test.ts`) verts, parcours réel en navigateur (création d'un journal équilibré, apparition dans l'historique, désactivation du bouton dès que le journal devient déséquilibré).

## 15. FACO > Comptable : Budgets + Verrouillage de transactions — construit le 2026-09-08

Suite directe des sections 13-14 (même échange) — les deux dernières vraies lacunes de la catégorie Comptable, construites ensemble sur demande explicite de l'utilisateur ("continu avec les deux autres"). Avec cette tranche, 5 des 6 onglets Zoho Books > Comptable ont un équivalent construit ; seuls "Mise à jour en bloc"/"Ajustements de la devise" restent hors périmètre (devise unique XAF).

**Verrouillage de transactions** :
- `entreprise.dateVerrouillageComptable` (nullable) — aucune écriture ne peut être datée à cette date ou avant.
- Contrôle centralisé dans `creerEcritures()` (`src/lib/comptabilite/ecritures.ts`), le point de passage unique de **toute** écriture comptable générée par un document (Facture, Dépense, Paiement, Reçu, Facture d'acompte, Facture fournisseur, Paiement effectué) — un seul changement couvre Ventes ET Achats, jamais dupliqué action par action. `verifierDateNonVerrouillee()` (`src/lib/comptabilite/verrouillage.ts`) est la fonction pure partagée.
- `creerJournalManuel()` insère directement dans `ecritureComptable` (ne passe jamais par `creerEcritures()`, ses lignes ne sont pas générées depuis un document) : la garde y est donc dupliquée explicitement, avec un message convivial (`{erreur}`) avant même de tenter l'insertion — contrairement aux actions Ventes/Achats, où une violation remonte comme une exception non interceptée (le filet de sécurité fonctionne partout, mais seul Journal manuel a un message d'erreur inline soigné pour l'instant ; écart volontaire, documenté ici plutôt que remonté silencieusement).
- Réglable depuis `/app/comptabilite#verrouillage` (`FormulaireVerrouillage`), réservé à `peut(role, "COMPTABILITE", "MODIFIER")`.

**Budgets** :
- `budget`/`budgetLigne` : un montant budgété par compte sur une période (pas de ventilation mensuelle comme chez Zoho — simplification délibérée). Contrainte unique `(budgetId, compteId)` : un compte ne peut apparaître qu'une fois par budget.
- Fiche détail (`/app/comptabilite/budgets/[id]`) calcule le Réalisé à la volée via `calculerBalance(tx, entrepriseId, dateFin, dateDebut)` — jamais stocké, toujours à jour. Un compte de produits (classe 7, créditeur par nature) voit son solde inversé pour un Réalisé positif, même convention que `calculerCompteDeResultat()`.

Testé : `tsc`/`eslint`/`vitest` (`journal-manuel` mis à jour + `verrouillage-comptable-logique`, `budget-logique`, `budget-fuite-rls`) verts, parcours réel en navigateur (création d'un budget avec ligne, Budgété/Réalisé/Écart affichés correctement, verrouillage posé puis un journal manuel avant la date refusé avec message explicite et un journal après la date accepté).

## 16. Fiche détail Produit (Zoho-style) — construit le 2026-09-08

L'utilisateur a collé le contenu d'une fiche article Zoho Books (onglets Vue d'ensemble/Transactions/Historique, Type d'élément, Source créée, Compte de vente, image jointe) et demandé le même niveau de détail au clic sur un produit — jusque-là `/app/produits` était une simple liste (créer/supprimer seulement, aucune fiche détail, aucune image).

Décisions validées avec l'utilisateur (les 3 recommandées) :
- **Page complète `/app/produits/[id]`**, jamais une fenêtre modale — cohérent avec toutes les autres fiches détail de ce produit (Deals, Contacts, Projets, Factures, Devis, Budgets...), aucune n'est un modal.
- **"Compte de vente" reste informatif** : affiche le compte réellement utilisé aujourd'hui (`706000 — Prestations de services`, toujours ce compte quel que soit BIEN/SERVICE — vérifié dans `genererEcrituresFactureEmise()`/`genererEcrituresRecuVente()`, `src/lib/comptabilite/ecritures.ts`), jamais configurable. Aucun changement de la logique comptable.
- **Historique minimal** : "Créé le [date] par [utilisateur]" seulement — un produit n'était (et reste, dans cette tranche) pas modifiable, un vrai journal de changements n'aurait rien à tracer.

Construit :
- `produit.creeParId` (backfillé sur le premier utilisateur de l'entreprise, aucune vraie donnée client n'existe encore) + `imageCleStockage`/`imageTypeMime` (nullable, jamais d'URL publique — même patron que `document.cleStockage`, réutilise `televerserDocument()`/`urlTelechargementDocument()`/`effacerObjetStockage()` de `src/lib/documents/stockage.ts`).
- `src/lib/produits/transactions.ts` (`recupererTransactionsProduit()`) — union des 7 tables de lignes qui portent un `produitId` (Devis, Facture, Commande client, Facture périodique, Ticket de vente, Bon de commande achat, Facture fournisseur), chacune filtrée par la portée du rôle sur son propre module (FACTURATION/ACHATS) — jamais un contournement de la portée via ce détour. `factureAcompte`/`avoirFacture`/`avoirFournisseur` n'ont pas de lignes, exclus à raison.
- `src/components/ui/tabs.tsx` — premier composant Tabs de ce projet (enveloppe `@base-ui/react/tabs`, même patron que `button.tsx`).
- `src/app/app/produits/[id]/page.tsx` (3 onglets), `.../image/route.ts` (miroir de `src/app/app/documents/[id]/route.ts`, URL signée fraîche à chaque requête), `.../formulaire-image-produit.tsx`. `/app/produits` liste désormais chaque ligne comme un lien vers sa fiche, avec vignette.

Testé : `tsc`/`eslint`/`vitest` (`produits-transactions-logique`, nouveau) verts, parcours réel en navigateur (3 onglets, Créé par correct, Compte de vente affiché, une ligne de Devis apparaît dans Transactions avec le bon montant/lien, l'échec de téléversement d'image faute de R2 configuré reste propre — pas de crash).

## 17. Documents autonomes (ni Dossier ni Projet) — corrigé le 2026-09-08

L'utilisateur a collé le contenu du module Documents de Zoho Books ("les fichiers peuvent venir de n'importe où [...] pas forcément rattaché à un deal ou autre chose") — signalant que le module général `document` (Palier 3, `/app/documents`) devait, comme le module "Documents financiers" (section correspondante déjà correcte), supporter un fichier qui ne concerne ni Dossier ni Projet.

**Défaut réel trouvé et corrigé** : `ajouterDocument()` (`src/lib/actions/document.ts`) refusait explicitement tout document sans `dossierId` ni `projetId` (`"Un document doit être rattaché à un dossier ou un projet."`), et `/app/documents/page.tsx` filtrait silencieusement `return false` pour ce même cas — un document autonome n'avait donc aucun moyen d'exister ni d'être vu, contrairement à `documentFinancier` (Books, section 16... — voir plus haut) qui a toujours correctement supporté une "Boîte de réception" sans rattachement.

**Deuxième défaut, trouvé en corrigeant le premier** : `journaliserAccesDocument()` ne vérifiait la restriction de sensibilité (PIECE_IDENTITE/DONNEES_SANTE) que via `document.dossierId` directement — un document rattaché seulement à un Projet (cas réel : `FormulaireDocument` sur la fiche Projet ne transmet jamais `dossierId`) contournait donc entièrement cette restriction. Corrigé en remontant au Dossier du Projet (`projet.dossierId`, toujours renseigné) quand `dossierId` est absent — appliqué à la fois dans `journaliserAccesDocument()` et dans le filtrage de `/app/documents/page.tsx`.

Corrections apportées :
- `ajouterDocument()` : la garde de rattachement obligatoire est supprimée ; un document autonome est **toujours** forcé en catégorie `GENERAL` (aucun Dossier auquel rattacher une restriction de sensibilité).
- `journaliserAccesDocument()` : pour un document autonome, la portée du module `DOCUMENTS` s'applique directement sur son propre `televerseParId` (`idsVisibles()`), même patron que les autres modules autonomes de ce produit (Achats, Suivi des heures...) — jamais un accès sans contrôle.
- `FormulaireDocument` gagne un prop `autoriserSensible` (défaut `true`) : masque le sélecteur de catégorie sensible quand `false`, utilisé sur `/app/documents` pour le dépôt autonome.
- `/app/documents` affiche désormais un formulaire de dépôt direct (sans Dossier/Projet) + les documents déjà autonomes, libellés "Document autonome".

Testé : `tsc`/`eslint`/`vitest` (`documents-autonomes-logique`, nouveau — un Employé de portée PROPRE ne voit jamais le document autonome d'un collègue, un document sensible rattaché seulement à un Projet reste bien restreint au responsable du Dossier) verts, parcours réel en navigateur.

## 18. Politiques de congé (RH) — construit le 2026-09-08

L'utilisateur a partagé le guide d'implémentation Zoho People complet et demandé de construire un module GRH inspiré. Vu l'ampleur (Congés, Shifts, Présence, Feuille de temps, Performance, Rémunération, Onboarding/Offboarding, Fichiers, LMS, Sondages, Help Desk, Rapports) face au socle RH déjà existant (dossier employé, congés avec solde manuel, pointage simple, évaluations en texte libre — voir `docs/palier-5-ressources-humaines-specification-technique.md`), l'utilisateur a choisi de commencer par les **politiques de congé** (extension la plus naturelle de l'existant), avec une créditation **manuelle** plutôt qu'une tâche planifiée (plus sûr, pas de risque de double créditation/prorata mal géré dès cette tranche).

Les deux règles non négociables du Palier 5 restent inchangées et n'ont pas été touchées : aucun calcul de cotisation CNPS/IRPP/paie, et le salaire reste toujours saisi à la main par l'Administrateur.

Construit :
- `politiqueConge` (FIXE ou ANCIENNETE) + `politiqueCongePalier` (paliers d'ancienneté cumulatifs) — nouvelles tables, RLS + FORCE RLS, testées par un test de fuite RLS dédié (`politique-conge-fuite-rls`).
- `dossierRH.politiqueCongeId` nullable — sans politique assignée, le solde continue d'être géré entièrement à la main comme avant cette tranche (rétrocompatible, zéro changement de comportement pour les entreprises existantes).
- `calculerDroitAnnuelConge()` (`src/lib/rh/politique-conge.ts`) — fonction pure, calcule le droit annuel à une date de référence (paliers d'ancienneté additionnés, ancienneté jamais négative). Testée isolément (`politique-conge-logique`, 5 cas dont l'exactitude du jour anniversaire).
- `crediterSoldeSelonPolitique()` — créditation manuelle et explicite par l'Administrateur, additive (n'écrase jamais un reliquat non pris), même logique que `approuverDemandeConge()` existant.
- UI : `/app/rh/politiques-conges` (gestion des politiques et paliers, Admin uniquement) ; fiche dossier RH (`/app/rh/[id]`) affiche la politique assignée + droit annuel calculé + bouton "Créditer".

Testé : `tsc`/`eslint`/`vitest` verts, parcours réel en navigateur (créer une politique par ancienneté, ajouter un palier, l'assigner à un dossier embauché il y a 6 ans, vérifier le droit annuel calculé 18+2=20, créditer, vérifier le solde mis à jour).

**Reste à explorer si l'utilisateur revient sur le module RH** (dans l'ordre suggéré par la comparaison avec Zoho People) : ~~historique des révisions de salaire~~ (fait, section 19), ~~processus de départ structuré~~ (fait, section 20), ~~fichiers RH dédiés~~ (fait, section 21), ~~sondages d'engagement~~ (fait, section 22 ci-dessous), assistance RH interne (tickets/FAQ). Shift management, LMS et Rapports RH consolidés n'ont pas de demande observée pour l'instant.

## 19. Historique des révisions de salaire (RH) — construit le 2026-09-08

Deuxième tranche du GRH inspiré de Zoho People ("Salary Revision History"), demandée immédiatement après les politiques de congé (section 18). Avant cette tranche, `dossierRH.salaireBase` était un simple champ mutable édité via `modifierDossierRH()` — chaque modification écrasait silencieusement la valeur précédente, sans aucune trace de qui avait changé quoi ni pourquoi.

La règle non négociable du Palier 5 reste inchangée : aucun calcul de paie, le salaire est toujours saisi à la main par l'Administrateur seul.

Construit :
- `revisionSalaire` (ancien/nouveau salaire, motif optionnel, auteur, date) — nouvelle table, RLS + FORCE RLS, testée par un test de fuite RLS dédié (`revision-salaire-fuite-rls`). `ancienSalaire` est `NULL` pour la toute première fixation d'un salaire.
- `salaireBase` retiré de `modifierDossierRH()` (formulaire général) — seule `reviserSalaire()` (`src/lib/actions/revision-salaire.ts`, Administrateur uniquement) peut désormais le modifier, pour qu'aucun chemin ne puisse changer le salaire sans laisser de trace dans `revisionSalaire`.
- `reviserSalaire()` capture l'ancien salaire (lu dans la même transaction) AVANT d'écraser la valeur — jamais un simple `UPDATE` isolé.
- UI : fiche dossier RH (`/app/rh/[id]`) gagne une section "Historique de salaire" (visible aux mêmes conditions que le salaire lui-même — `peutVoirSalaire()`, Admin ou l'intéressé) avec le formulaire de révision (Admin) et la liste chronologique.

Testé : `tsc`/`eslint` verts ; `revision-salaire-logique` (capture correcte de l'ancien salaire sur deux révisions consécutives, la première ligne d'historique n'est jamais écrasée) et `revision-salaire-fuite-rls` passent en isolation, ainsi que les tests RH existants (`palier-5-conges-pointage`, `politique-conge-*`) non affectés ; parcours réel en navigateur (fixer un salaire initial, le réviser une seconde fois, vérifier que les deux lignes d'historique restent visibles).

## 20. Processus de départ structuré — offboarding (RH) — construit le 2026-09-08

Troisième tranche du GRH inspiré de Zoho People ("Offboarding Service"), demandée immédiatement après l'historique des révisions de salaire (section 19). Avant cette tranche, rien n'existait pour un départ d'employé — pas de demande de démission, pas de suivi de clôtures (matériel, accès, finances), pas d'entretien de sortie, et surtout pas de révocation réelle d'accès.

**Défaut de sécurité réel trouvé et corrigé en construisant cette tranche** : `utilisateur.statut` (enum `ACTIF`/`INVITE`/`DESACTIVE`) est exposé sur la session Better-Auth depuis le tout premier scaffold (`additionalFields`, `src/lib/auth.ts`) mais n'était vérifié absolument nulle part — un compte marqué `DESACTIVE` gardait un accès complet à l'application tant que son cookie de session restait valide, rendant ce statut purement décoratif. `recupererUtilisateurConnecte()` (point de vérification unique documenté dans `src/proxy.ts` : "la vérification complète se fait côté Server Component") traite désormais tout statut différent de `ACTIF` comme non connecté. Vérifié sans risque de régression : les deux flux de création de compte (inscription initiale, acceptation d'invitation) fixent déjà explicitement `statut=ACTIF`, comme le défaut en base — et confirmé positivement en isolant la cause d'un échec e2e non lié (voir plus bas).

Décisions de simplification par rapport à Zoho (délibérées, pas des oublis) :
- Toujours initiée par l'employé lui-même (comme `demandeConge`) — jamais un Manager/Admin au nom d'un tiers, contrairement à Zoho qui l'autorise.
- Pas de modèle de clôtures réutilisable ("Clearance Forms" chez Zoho) — items ad hoc saisis à chaque demande, tant qu'aucune entreprise cliente ne demande à réutiliser toujours la même liste.
- Entretien de sortie en texte libre (même philosophie que `evaluation.commentaire`) — jamais un questionnaire structuré.

Construit :
- `demandeDepart` (type, date souhaitée, statut EN_ATTENTE/APPROUVEE/REFUSEE/CLOTUREE, entretien de sortie) + `clearanceDepart` (items ad hoc, un responsable désigné peut valider SA clôture même sans droit RH général — même principe que le pointage, toujours pour soi-même). `dossierRH.dateDepart` dénormalisé, renseigné uniquement à la clôture.
- `cloturerDepart()` (`src/lib/actions/depart.ts`, Administrateur uniquement) bloque tant qu'une clôture reste incomplète (jamais un simple avertissement ignorable), puis désactive réellement le compte (`utilisateur.statut = DESACTIVE`) et supprime ses sessions actives pour une déconnexion immédiate plutôt que d'attendre l'expiration du cookie.
- UI : page dédiée `/app/rh/[id]/depart` (demande → approbation → clôtures → clôture définitive) + file d'attente des demandes en attente sur le tableau de bord RH (Admin/Manager), même patron que les congés en attente.

Testé : `tsc`/`eslint` verts ; `depart-logique` (reproduit la garde de clôture incomplète et les effets de `cloturerDepart()`) et `depart-fuite-rls` passent en isolation ; parcours réel en navigateur de bout en bout via le vrai flux d'invitation (demande → approbation → clôture bloquée puis débloquée après validation → compte réellement désactivé → session révoquée → accès refusé après coup), confirmant que le correctif DESACTIVE fonctionne en conditions réelles.

**Anomalie pré-existante isolée pendant cette tranche, non corrigée ici (hors périmètre)** : le test e2e `palier-0-inscription-connexion.spec.ts` ("connexion avec les identifiants créés ramène au tableau de bord") échoue par timeout sur `page.waitForURL("/app")`. Isolé par expérience contrôlée (revert temporaire de `session.ts` à son état d'avant cette tranche, même échec identique) — confirmé indépendant de tout changement de cette session, probablement lié à la façon dont Playwright détecte une transition côté client (RSC/`router.push`) plutôt qu'une navigation classique. Le test voisin de ce même fichier échoue aussi, pour une raison différente et déjà identifiée : il cherche un lien "Facturation" qui n'existe plus depuis le regroupement sous "FACO" (échange antérieur de cette session) — fichier de test jamais mis à jour en conséquence. Un chantier séparé, pas traité ici.

## 21. Fichiers RH dédiés (RH) — construit le 2026-09-08

Quatrième tranche du GRH inspiré de Zoho People ("Employee Files"), demandée immédiatement après l'offboarding (section 20). Avant cette tranche, aucun fichier ne pouvait être rattaché spécifiquement à un dossier RH — seuls les Documents généraux (Palier 3, rattachés à un Dossier/Projet CRM) et les Documents financiers (Books) existaient.

Différence de conception volontaire par rapport à Zoho : Zoho distingue "Employee Files" (gérés par l'Admin, restreints) et "Personal Uploads" (espace privé de l'employé, **invisible même de l'Administrateur**). Ce deuxième niveau n'a pas été repris — il contredirait le modèle de sécurité déjà établi dans ce produit, où l'Administrateur a toujours une vue d'ensemble complète (salaire, motifs de congé maladie, etc.) ; pas de zone opaque à l'Admin dans une TPE où l'Admin est souvent le patron lui-même.

Construit :
- `documentRH` (nouvelle table, RLS + FORCE RLS) — contrairement à la table `document` générale (catégories mixtes, portée d'équipe normale), TOUT fichier ici est par nature une pièce RH : visibilité uniforme, pas de distinction par catégorie.
- Accès réservé à l'Administrateur ou à l'intéressé lui-même — réutilise `peutVoirSalaire()` telle quelle (`src/lib/rh/acces.ts`), donc plus strict que la portée RH normale d'un Manager (qui voit pourtant le dossier de son équipe).
- `televerserDocumentRH()`/`effacerDocumentRH()` (`src/lib/actions/document-rh.ts`) + route de service `/app/rh/[id]/fichiers/[documentId]` (miroir de `produits/[id]/image`, URL R2 signée fraîche à chaque requête, jamais stockée).
- UI : nouvelle section "Fichiers" sur la fiche dossier RH (`/app/rh/[id]`).

Testé : `tsc`/`eslint` verts ; `document-rh-logique` (confirme explicitement qu'un Manager de portée EQUIPE ne voit pas les fichiers d'un employé qu'il gère par ailleurs) et `document-rh-fuite-rls` passent en isolation, ainsi que les 8 autres fichiers de tests RH exécutés ensemble (23 tests, aucune régression croisée) ; parcours réel en navigateur (fichier existant listé et téléchargeable, échec de téléversement faute de R2 configuré reste propre).

## 22. Sondages d'engagement (RH) — construit le 2026-09-08

Cinquième tranche du GRH inspiré de Zoho People, demandée immédiatement après les fichiers RH dédiés (section 21). Zoho distingue trois outils (eNPS Survey, Pulse Survey, Engagement Survey) — réunis ici en un seul modèle simple : un sondage a des questions de type NPS (0-10), ÉTOILES (1-5) ou TEXTE, dans n'importe quelle combinaison.

Point le plus délicat de cette tranche : l'anonymat doit être réel, pas seulement une promesse d'interface. `sondageReponse` ne porte structurellement aucune colonne utilisateur — impossible de relier une ligne à son auteur même en lisant la base directement. `sondageParticipation` est une table séparée (aucune FK vers `sondageReponse`) qui prouve seulement qu'un employé a participé — utile pour bloquer une double soumission et afficher un taux de participation, jamais pour savoir ce qu'il a répondu. Un seuil (`SEUIL_MIN_PARTICIPANTS_POUR_RESULTATS = 3`) cache aussi les résultats agrégés tant qu'une question n'a pas assez de réponses, pour qu'une réponse ne devienne pas identifiable par élimination sur une petite équipe.

Construit :
- 4 tables (`sondage`, `sondageQuestion`, `sondageReponse`, `sondageParticipation`), RLS + FORCE RLS.
- `calculerResultatsQuestion()` (`src/lib/rh/sondage.ts`) — le score NPS est la vraie formule (%Promoteurs 9-10 - %Détracteurs 0-6), jamais une simple moyenne, qui donnerait un chiffre trompeur pour qui connaît la méthodologie.
- Gestion (créer/ouvrir/fermer/supprimer un brouillon) réservée à l'Administrateur — un sondage est par nature à l'échelle de l'entreprise, jamais une portée EQUIPE. Un sondage `OUVERT`/`FERME` n'est jamais supprimable (même esprit qu'une facture, CLAUDE.md).
- UI : `/app/rh/sondages` (liste, création), `/app/rh/sondages/[id]` (formulaire de réponse pour un employé qui n'a pas encore répondu, résultats agrégés pour l'Administrateur).

Testé : `tsc`/`eslint` verts ; `sondage-logique` (formule eNPS vérifiée sur plusieurs cas dont les extrêmes ±100, anonymat vérifié structurellement contre une vraie base — aucune colonne de `sondageReponse` ne contient un id utilisateur —, contrainte unique anti double-soumission) et `sondage-fuite-rls` passent en isolation, ainsi que les 9 autres fichiers de tests RH exécutés ensemble (31 tests, aucune régression croisée) ; parcours réel en navigateur de bout en bout (création → ouverture → réponse anonyme → résultat NPS bloqué sous le seuil mais commentaire texte visible → fermeture).

## 23. Assistance RH interne (tickets) — construit le 2026-09-09

Sixième et dernière tranche identifiée du GRH inspiré de Zoho People ("HR Help Desk"). Simplifié par rapport à Zoho, qui propose des catégories entièrement configurables (formulaires de clôture réutilisables, modèles d'entretien de sortie, etc.) : ici une catégorie porte simplement un nom et un agent par défaut, un ticket un titre/description/statut, et un fil de messages simple (même forme que `commentaire` du Palier 2, dédié plutôt que polymorphe).

Point le plus délicat de cette tranche : la visibilité. Un ticket peut être assigné à n'importe quel agent désigné par la catégorie (pas nécessairement le manager de l'équipe du demandeur) — la portée RH normale (`idsVisibles(..., "RH")`) ne convient donc pas. `peutVoirTicket()` (`src/lib/rh/ticket.ts`) restreint plutôt l'accès au demandeur, à l'agent assigné, ou à l'Administrateur — même principe que `clearanceDepart` (offboarding, section 19) où le responsable désigné agit sur son propre item indépendamment de la portée générale. Vérifié explicitement par un test qui confirme qu'un Manager ne voit pas le ticket d'un employé de son équipe si le ticket est assigné à un agent qui n'est pas lui.

Construit :
- 3 tables (`categorieTicketRH`, `ticketRH`, `messageTicketRH`), RLS + FORCE RLS.
- Gestion des catégories réservée à l'Administrateur (même niveau que les politiques de congé/sondages) ; ouvrir un ticket réservé à soi-même (même choix que `creerDemandeConge`/`creerDemandeDepart`) ; changer le statut réservé à l'agent assigné ou l'Administrateur ; réassigner réservé à l'Administrateur.
- `changerStatutTicket()` revérifie la valeur reçue à l'exécution (`STATUTS_VALIDES.includes(...)`) plutôt que de faire confiance au typage TypeScript du contrôle côté client, qui ne garantit rien à l'exécution.
- UI : `/app/rh/tickets` (liste, création de catégorie pour l'Administrateur, ouverture de ticket), `/app/rh/tickets/[id]` (fil de messages, changement de statut, réassignation).

Testé : `tsc`/`eslint` verts ; `ticket-rh-logique` (Administrateur/demandeur/agent voient le ticket, Manager de l'équipe du demandeur non — la garde de portée attendue) et `ticket-rh-fuite-rls` passent en isolation ; parcours réel en navigateur confirmé pour la création de catégorie, l'ouverture de ticket, l'échange de messages, et le changement de statut jusqu'à "Résolu" (vérification complète bout-en-bout côté employé interrompue par la latence Neon documentée dans CLAUDE.md sous sollicitation prolongée — code déjà validé par ailleurs, jamais une erreur logique reproductible constatée).

**Le module RH couvre désormais les six zones identifiées dans la comparaison avec Zoho People** (politiques de congé, historique des révisions de salaire, offboarding, fichiers RH dédiés, sondages d'engagement, assistance RH interne). Shift management, LMS et Rapports RH consolidés restent non construits, sans demande observée à ce jour.

## Quand y revenir

Ce fichier est une note vivante : à mettre à jour (ajouter/rayer une ligne) plutôt que d'ouvrir un nouveau document à chaque fois qu'un manque est identifié, jusqu'à ce qu'un vrai chantier soit lancé sur l'un de ces points.
