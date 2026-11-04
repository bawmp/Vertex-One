# Liste de contrôle — priorités 3 et 4 (stock et comptabilité)

À refaire à la main sur le site en production (vertexone.cm), avec le compte Administrateur d'une entreprise de test ou la vôtre.
Le parcours automatisé équivalent tourne en local : `tests-e2e/priorite-4-comptabilite-stock.spec.ts`.

Légende : [ ] à faire — noter l'écart si le résultat attendu n'est pas obtenu.

## 0. Avant de commencer
- [ ] Connexion Administrateur réussie, le menu « One Books » s'ouvre.
- [ ] Gestion de stock activée (Paramètres) : sinon les pages de stock proposent de l'activer.

## 1. Menu Stock (P4.4)
- [ ] One Books > **Stock** : Dépôts, Réapprovisionnement, Inventaire, Scanner, Péremptions, Numéros de série.
- [ ] Chaque lien ouvre sa page sans erreur.

## 2. Numéros de série (P3.4 suite)
- [ ] Fiche d'un produit suivi en stock > carte « Numéros de série » > **Activer le suivi**.
- [ ] Coller deux numéros (un par ligne) : « 2 numéro(s) lu(s) », puis **Ajouter les numéros** (origine : nouvelle entrée) → le stock monte de 2.
- [ ] Un doublon dans la saisie est signalé et ignoré.
- [ ] **Chercher un numéro** (page Numéros de série) : un numéro partiel retrouve le produit et son état.
- [ ] Vendre une unité (ticket de vente ou facture) : un numéro passe « Vendu » avec lien vers le document.
- [ ] Annuler cette vente : le numéro redevient « En stock ».
- [ ] Retirer un numéro (motif « Casse ») : le stock baisse de 1 ; le remettre en stock fonctionne.
- [ ] Fiche de la facture : carte « Numéros de série vendus » ; « Changer le numéro » échange le numéro (l'ancien revient en stock, le stock ne change pas).
- [ ] Le PDF de la facture et du ticket affiche « N° de série : … » sous la ligne.
- [ ] Avoir avec remise en stock d'un produit à numéros : un numéro revient « En stock » par unité rendue.

## 3. Exports comptables (P4.1, P4.2)
- [ ] Comptabilité > Livres comptables > **Pour Sage** / **Pour Ciel** / **Fichier des écritures** : un fichier se télécharge, les écritures sont celles de la période.
- [ ] **Imprimer en PDF** sur Livres, Déclaration de TVA et Clients/fournisseurs : le PDF s'ouvre, montants alignés, totaux visibles.
- [ ] Essayer l'import d'un petit fichier Sage/Ciel dans le logiciel du comptable avant tout gros import (colonnes non validées).

## 4. Comptabilité analytique (P4.5)
- [ ] Comptabilité > Comptabilité analytique : créer une section (code + nom).
- [ ] Rattacher une facture à la section : « 2 écriture(s) rattachée(s) ».
- [ ] Enregistrer un règlement sur cette facture, puis recharger : le résultat de la section inclut la facture, et « Non affecté » ne change pas.
- [ ] Désactiver la section : elle n'est plus proposée dans les listes de rattachement.
- [ ] Fiche d'un client > « Section analytique » : choisir une section, puis créer une facture pour ce client : elle est rattachée toute seule.
- [ ] Achats > Nouvelle dépense : la liste « Section analytique (optionnel) » rattache la dépense à la section choisie.

## 5. Devises (P4.7)
- [ ] Paramètres > Devises et taux de change : ajouter EUR à 655,957.
- [ ] Fiche d'une facture : une ligne « ≈ … € » apparaît sous le TTC.
- [ ] Le convertisseur calcule dans les deux sens.

## 6. Exercice décalé (P4.6)
- [ ] Comptabilité > Clôture d'exercice : choisir un autre mois de début ; les exercices affichent « du … au … » avec les bonnes dates.
- [ ] États financiers : le titre du bilan indique la vraie date de fin ; le PDF aussi.
- [ ] Immobilisations : avec un début en juillet, un bien acquis en septembre s'amortit au prorata des mois restants jusqu'au 30 juin ; « Passer les dotations » date l'écriture du 30 juin.
- [ ] Régularisations : la date proposée est le dernier jour de l'exercice, la reprise tombe au premier jour du suivant.
- [ ] Ne rien clôturer en production pour ce contrôle (la clôture verrouille la comptabilité).
- [ ] Remettre le début sur janvier si le test a été fait sur votre vraie entreprise.

## 7. Déclarations fiscales (P4.8)
- [ ] Comptabilité > Déclarations fiscales : douze mois de TVA avec échéance (le 15 du mois suivant).
- [ ] Noter un mois « Payée » avec montant et récépissé : le badge et les valeurs persistent après rechargement.
- [ ] Un mois non déclaré dont l'échéance est passée est « En retard ».
- [ ] Estimation de l'impôt : modifier le taux, « Calculer » met à jour le montant ; la mention « indicative » est visible.

## 7 bis. Acomptes d'impôt sur les sociétés
- [ ] Déclarations fiscales : la section « Acomptes » liste les mois écoulés de l'exercice avec le chiffre d'affaires et l'acompte calculé (taux modifiable).
- [ ] Noter un mois « Payée » avec son montant : le bilan en bas déduit l'acompte de l'impôt estimé ; un excédent s'affiche en crédit à imputer.
- [ ] Un acompte et la TVA du même mois restent deux suivis séparés.

## 8. Anglais (P4.3)
- [ ] Basculer la langue en anglais : les pages Comptabilité, Analytique, Déclarations et Devises s'affichent en anglais (libellés des comptes SYSCOHADA restant en français).

## 9. Droits et cloisonnement
- [ ] Un Employé ou Manager ne voit pas Comptabilité (accès refusé), mais voit Stock selon ses modules.
- [ ] Deux entreprises : ce que l'une crée (section, taux, déclaration, numéros de série) n'apparaît jamais chez l'autre.

## 9 bis. Fiches collaborateur, groupe, organigramme, garantie (2026-11-04)
- [ ] Une fiche affiche photo, naissance, tâches ; le salaire n'est visible que de l'Administrateur et de la personne (jamais d'un Manager).
- [ ] Un Manager crée une fiche d'employé sans champ salaire ; la photo ne s'ouvre pas sans session (lien direct refusé).
- [ ] RH > Groupe : le partage n'est actif que si les DEUX entreprises l'ont activé ; jamais de salaire chez le partenaire.
- [ ] Organigramme : l'arbre s'affiche, chaque carte ouvre la fiche.
- [ ] Anniversaire : carte visible, email du jour reçu une seule fois ; mot de félicitations seulement si l'interrupteur est activé.
- [ ] Produit suivi par numéro : fixer une garantie, vendre un numéro choisi au ticket de vente, vérifier la fin de garantie et le badge.
- [ ] Facture fournisseur avec section analytique, puis export CSV : la ligne de la section apparaît.
- [ ] Textes très longs sur mobile (390 px) : rien ne déborde.

## 10. Après la mise en ligne
- [ ] Déploiements Vercel et Railway en succès.
- [ ] Aucune erreur dans les journaux Vercel dans l'heure qui suit.
