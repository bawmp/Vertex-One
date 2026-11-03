# Stock et comptabilité — ce qui manque, par ordre de priorité

Écrit pour : l'équipe qui décide de la suite de Vertex One. État au **2 novembre 2026**, après les étapes 1 à 5c du stock et de la comptabilité (voir `docs/fonctionnalites-recentes.md`) et la distinction entreprises de produits / de services.

Principe de classement : d'abord ce qui **fausse les chiffres** d'un client qui l'utilise déjà, ensuite ce qu'un **comptable ou un commerçant exigeant** réclamera dans les premiers mois, puis le confort, puis l'ouverture. Les **cases cochées** sont faites ; chaque ligne porte une estimation d'effort (S = une demi-journée, M = une à deux journées, L = plusieurs journées).

## Priorité 1 — Cohérence des chiffres (à faire d'abord)

- [x] **P1.1 Annuler une facture, un ticket de vente ou une facture fournisseur remet le stock et contre-passe les écritures** (M). Avant : le statut passait à « annulée », mais le stock et la comptabilité restaient comme si la vente avait eu lieu.
- [x] **P1.2 Avoirs partiels et retours de marchandises** (L) : un avoir sur certaines lignes seulement, avec choix de remettre ou non les articles en stock (un article cassé ne se remet pas en stock).
- [x] **P1.3 Choix du dépôt sur chaque document** (M) : devis accepté, facture, ticket, bon de commande, facture fournisseur. Aujourd'hui toujours le dépôt principal.
- [x] **P1.4 Option « interdire la vente en rupture »** (S) : réglage par entreprise ; sinon le stock négatif reste toléré comme aujourd'hui.
- [x] **P1.5 Arrêter le suivi du stock d'un produit** (S), ce qui permet aussi de désactiver la gestion de stock après coup.

## Priorité 2 — Comptabilité qu'un comptable attend

- [x] **P2.1 Comptes de tiers : grand livre auxiliaire clients et fournisseurs, balance âgée, lettrage des règlements** (L).
- [x] **P2.2 Annulation d'une clôture d'exercice** (M), avec trace, réservée à l'Administrateur.
- [x] **P2.3 États financiers SYSCOHADA officiels** (bilan, compte de résultat, annexes) et **export PDF** (L).
- [x] **P2.4 Régularisations de fin d'exercice** (L) : charges à payer, produits constatés d'avance, provisions.
- [x] **P2.5 Immobilisations et amortissements** (L) : registre, plans, dotations automatiques.
- [x] **P2.6 Valeur du stock à une date passée, et par dépôt** (M) : nécessaire pour clôturer un exercice plusieurs semaines après sa fin.
- [x] **P2.7 Rôle « comptable externe »** (M) : accès en lecture aux seuls livres, sans voir le reste de l'entreprise.

## Priorité 3 — Stock avancé

- [x] **P3.1 Réapprovisionnement** (M) : liste de ce qu'il faut commander, bon de commande fournisseur proposé d'un clic.
- [x] **P3.2 Alertes de stock bas par email ou notification** (S).
- [x] **P3.3 Inventaire par sessions** (M) : comptage en brouillon, validation par un responsable, plusieurs personnes en parallèle.
- [x] **P3.4 Lots et dates de péremption** (L) — FAIT, numéros de série compris (migration 0160).
- [x] **P3.5 Variantes (taille, couleur) et unités de mesure (carton, pièce)** (L) — FAIT (voir limites dans docs/fonctionnalites-recentes.md).
- [x] **P3.6 Codes-barres et lecture au téléphone** (M) — FAIT (lecture par caméra à vérifier sur un vrai téléphone).
- [x] **P3.7 Réservation de stock sur une commande client** (M).
- [x] **P3.8 Valorisation « premier entré, premier sorti »** en option (M).
- [x] **P3.9 Kits et nomenclatures** (M).
- [x] **P3.10 Listes de prix** (M).

## Priorité 4 — Ouverture, confort, international

- [ ] **P4.1 Exports vers les logiciels courants** (fichier des écritures, formats Sage / Ciel) (M).
- [ ] **P4.2 PDF de tous les livres et déclarations** (M).
- [ ] **P4.3 Traduction anglaise des pages de comptabilité et de stock** (M). La comptabilité est aujourd'hui en français seulement ; le stock est traduit.
- [ ] **P4.4 Raccourci « Stock » dans le menu** pour les entreprises de produits (S).
- [ ] **P4.5 Comptabilité analytique** (par projet, par agence) (L).
- [ ] **P4.6 Exercice décalé** (qui ne suit pas l'année civile) (M).
- [ ] **P4.7 Multi-devise** (L).
- [ ] **P4.8 Impôt sur les sociétés, acomptes et télédéclaration de TVA** (L) : à ne faire qu'avec un comptable partenaire.

## Hors périmètre (décision de produit, déjà actée)

- Paie, CNPS, IRPP et bulletins : jamais calculés dans le produit (seule l'exportation des données vers un partenaire est prévue).

## Défauts connus sans lien avec les priorités ci-dessus

- Le coût moyen n'est pas recalculé quand un achat facturé est annulé (approximation assumée).
- La valeur du stock est celle d'aujourd'hui, pas celle d'une date passée.
- Les écritures de règlement d'une facture annulée restent : le client apparaît alors créditeur du montant payé (à rembourser), ce qui est le comportement comptable attendu.
