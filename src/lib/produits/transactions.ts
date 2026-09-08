import { eq, inArray, and } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TransactionDrizzle } from "@/db/client";
import {
  ligneDevis,
  devis,
  ligneFacture,
  facture,
  ligneBonCommandeVente,
  bonCommandeVente,
  ligneFactureRecurrente,
  factureRecurrente,
  ligneRecuVente,
  recuVente,
  ligneBonCommandeAchat,
  bonCommandeAchat,
  ligneFactureFournisseur,
  factureFournisseur,
} from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

export type TransactionProduit = {
  id: string;
  type: string;
  numero: string;
  statut: string;
  date: Date;
  montantLigne: number;
  lien: string;
};

/**
 * Fiche détail Produit, onglet "Transactions" (échange du 2026-09-08) —
 * union des 7 tables de lignes qui portent un produitId (confirmé
 * exhaustif : factureAcompte/avoirFacture/avoirFournisseur n'ont pas de
 * lignes, voir schema.ts). Chaque branche respecte la portée du rôle sur
 * son propre module (FACTURATION ou ACHATS), exactement comme
 * src/app/app/facturation/page.tsx et src/app/app/achats/page.tsx filtrent
 * déjà leurs listes — jamais un contournement de la portée via ce détour.
 * `lien` pointe vers une vraie fiche détail quand elle existe (Devis,
 * Facture), sinon vers l'ancre de section déjà construite sur la page liste
 * — jamais une route fabriquée qui n'existe pas.
 */
export async function recupererTransactionsProduit(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  produitId: string
): Promise<TransactionProduit[]> {
  const [visiblesFacturation, visiblesAchats] = await Promise.all([
    idsVisibles(tx, utilisateurConnecte, "FACTURATION"),
    idsVisibles(tx, utilisateurConnecte, "ACHATS"),
  ]);

  const filtreAssigne = (visibles: "TOUT" | string[], colonne: AnyPgColumn) => (visibles === "TOUT" ? undefined : inArray(colonne, visibles));

  const [
    lignesDevis,
    lignesFacture,
    lignesBcv,
    lignesFr,
    lignesRv,
    lignesBca,
    lignesFf,
  ] = await Promise.all([
    tx
      .select({ id: ligneDevis.id, quantite: ligneDevis.quantite, prixUnitaire: ligneDevis.prixUnitaire, numero: devis.numero, statut: devis.statut, date: devis.creeLe, docId: devis.id })
      .from(ligneDevis)
      .innerJoin(devis, eq(ligneDevis.devisId, devis.id))
      .where(and(eq(ligneDevis.produitId, produitId), filtreAssigne(visiblesFacturation, devis.assigneAId))),
    tx
      .select({ id: ligneFacture.id, quantite: ligneFacture.quantite, prixUnitaire: ligneFacture.prixUnitaire, numero: facture.numero, statut: facture.statut, date: facture.dateEmission, docId: facture.id })
      .from(ligneFacture)
      .innerJoin(facture, eq(ligneFacture.factureId, facture.id))
      .where(and(eq(ligneFacture.produitId, produitId), filtreAssigne(visiblesFacturation, facture.assigneAId))),
    tx
      .select({
        id: ligneBonCommandeVente.id,
        quantite: ligneBonCommandeVente.quantite,
        prixUnitaire: ligneBonCommandeVente.prixUnitaire,
        numero: bonCommandeVente.numero,
        statut: bonCommandeVente.statut,
        date: bonCommandeVente.dateCommande,
      })
      .from(ligneBonCommandeVente)
      .innerJoin(bonCommandeVente, eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVente.id))
      .where(and(eq(ligneBonCommandeVente.produitId, produitId), filtreAssigne(visiblesFacturation, bonCommandeVente.assigneAId))),
    tx
      .select({
        id: ligneFactureRecurrente.id,
        quantite: ligneFactureRecurrente.quantite,
        prixUnitaire: ligneFactureRecurrente.prixUnitaire,
        numero: factureRecurrente.libelle,
        statut: factureRecurrente.statut,
        date: factureRecurrente.dateDebut,
      })
      .from(ligneFactureRecurrente)
      .innerJoin(factureRecurrente, eq(ligneFactureRecurrente.factureRecurrenteId, factureRecurrente.id))
      .where(and(eq(ligneFactureRecurrente.produitId, produitId), filtreAssigne(visiblesFacturation, factureRecurrente.assigneAId))),
    tx
      .select({ id: ligneRecuVente.id, quantite: ligneRecuVente.quantite, prixUnitaire: ligneRecuVente.prixUnitaire, numero: recuVente.numero, statut: recuVente.statut, date: recuVente.dateEmission })
      .from(ligneRecuVente)
      .innerJoin(recuVente, eq(ligneRecuVente.recuVenteId, recuVente.id))
      .where(and(eq(ligneRecuVente.produitId, produitId), filtreAssigne(visiblesFacturation, recuVente.assigneAId))),
    tx
      .select({
        id: ligneBonCommandeAchat.id,
        quantite: ligneBonCommandeAchat.quantite,
        prixUnitaire: ligneBonCommandeAchat.prixUnitaire,
        numero: bonCommandeAchat.numero,
        statut: bonCommandeAchat.statut,
        date: bonCommandeAchat.dateCommande,
      })
      .from(ligneBonCommandeAchat)
      .innerJoin(bonCommandeAchat, eq(ligneBonCommandeAchat.bonCommandeAchatId, bonCommandeAchat.id))
      .where(and(eq(ligneBonCommandeAchat.produitId, produitId), filtreAssigne(visiblesAchats, bonCommandeAchat.assigneAId))),
    tx
      .select({
        id: ligneFactureFournisseur.id,
        quantite: ligneFactureFournisseur.quantite,
        prixUnitaire: ligneFactureFournisseur.prixUnitaire,
        numero: factureFournisseur.numero,
        statut: factureFournisseur.statut,
        date: factureFournisseur.dateFacture,
      })
      .from(ligneFactureFournisseur)
      .innerJoin(factureFournisseur, eq(ligneFactureFournisseur.factureFournisseurId, factureFournisseur.id))
      .where(and(eq(ligneFactureFournisseur.produitId, produitId), filtreAssigne(visiblesAchats, factureFournisseur.assigneAId))),
  ]);

  const transactions: TransactionProduit[] = [
    ...lignesDevis.map((l) => ({ id: l.id, type: "Devis", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: `/app/facturation/devis/${l.docId}` })),
    ...lignesFacture.map((l) => ({ id: l.id, type: "Facture", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: `/app/facturation/factures/${l.docId}` })),
    ...lignesBcv.map((l) => ({ id: l.id, type: "Commande client", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: "/app/facturation#commandes-client" })),
    ...lignesFr.map((l) => ({ id: l.id, type: "Facture périodique", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: "/app/facturation#factures-periodiques" })),
    ...lignesRv.map((l) => ({ id: l.id, type: "Ticket de vente", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: "/app/facturation#tickets-de-vente" })),
    ...lignesBca.map((l) => ({ id: l.id, type: "Bon de commande", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: "/app/achats#bons-de-commande" })),
    ...lignesFf.map((l) => ({ id: l.id, type: "Facture fournisseur", numero: l.numero, statut: l.statut, date: l.date, montantLigne: l.quantite * l.prixUnitaire, lien: "/app/achats#factures-fournisseurs" })),
  ];

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
}
