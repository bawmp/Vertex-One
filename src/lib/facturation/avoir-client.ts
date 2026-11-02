import { and, asc, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { avoirClient, entreprise, facture, ligneAvoirClient, ligneFacture, mouvementStock, paiement, produit } from "@/db/schema";
import { calculerMontants } from "./calcul";
import { genererNumeroAvoirClient } from "./numerotation";
import { montantNetFacture, totalAvoirsFacture } from "./solde";
import { resoudrePromessesFacture } from "./promesse";
import { genererEcrituresAvoirClient } from "@/lib/comptabilite/ecritures";
import { verifierDateNonVerrouillee } from "@/lib/comptabilite/verrouillage";
import { entrerStockDocument } from "@/lib/produits/stock";
import { m } from "@/lib/i18n/catalogue";

/**
 * Avoirs clients partiels et retours de marchandises (2026-11-02, priorité 1.2). Un avoir porte sur des lignes précises d'une facture et
 * des quantités précises ; il ne peut jamais créditer plus que ce qui a été facturé (tous avoirs confondus). Il réduit ce que le client
 * doit encore (la facture d'origine ne change pas), défait la vente de ces lignes en comptabilité et, ligne par ligne, remet ou non les
 * articles en stock. Une facture entièrement créditée devient « annulée ».
 */

export type LigneACrediter = { ligneFactureId: string; quantite: number; remettreEnStock: boolean };
export type ResultatAvoirClient = { ok: true; avoirId: string; numero: string; montantTTC: number; factureAnnulee: boolean } | { ok: false; erreur: string };

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

export type LigneCreditable = { ligneFactureId: string; designation: string; produitId: string | null; produitSuivi: boolean; prixUnitaire: number; tauxTVA: number; facturee: number; creditee: number; restant: number };

/** Pour chaque ligne de la facture : ce qui a été facturé, ce qui est déjà crédité par d'autres avoirs, ce qui reste créditable. */
export async function lignesCreditables(tx: TransactionDrizzle, entrepriseId: string, factureId: string): Promise<LigneCreditable[]> {
  const lignes = await tx.select().from(ligneFacture).where(and(eq(ligneFacture.factureId, factureId), eq(ligneFacture.entrepriseId, entrepriseId))).orderBy(asc(ligneFacture.id));
  if (lignes.length === 0) return [];
  const credites = await tx.select({ ligneFactureId: ligneAvoirClient.ligneFactureId, quantite: ligneAvoirClient.quantite }).from(ligneAvoirClient).where(inArray(ligneAvoirClient.ligneFactureId, lignes.map((l) => l.id)));
  const parLigne = new Map<string, number>();
  for (const c of credites) parLigne.set(c.ligneFactureId, (parLigne.get(c.ligneFactureId) ?? 0) + c.quantite);
  const idsProduits = [...new Set(lignes.map((l) => l.produitId).filter((x): x is string => Boolean(x)))];
  const suivis = idsProduits.length > 0 ? await tx.select({ id: produit.id, suivi: produit.suiviStock }).from(produit).where(inArray(produit.id, idsProduits)) : [];
  const suiviParId = new Map(suivis.map((p) => [p.id, p.suivi]));
  return lignes.map((l) => {
    const creditee = arrondi2(parLigne.get(l.id) ?? 0);
    return {
      ligneFactureId: l.id,
      designation: l.designation,
      produitId: l.produitId,
      produitSuivi: l.produitId ? suiviParId.get(l.produitId) === true : false,
      prixUnitaire: l.prixUnitaire,
      tauxTVA: l.tauxTVA,
      facturee: l.quantite,
      creditee,
      restant: Math.max(0, arrondi2(l.quantite - creditee)),
    };
  });
}

export async function listerAvoirsFacture(tx: TransactionDrizzle, entrepriseId: string, factureId: string) {
  return tx.select().from(avoirClient).where(and(eq(avoirClient.factureId, factureId), eq(avoirClient.entrepriseId, entrepriseId))).orderBy(asc(avoirClient.creeLe));
}

/** Crée l'avoir : tout ou rien (une seule transaction). Droit et forfait sont revérifiés par l'appelant ; la facture est relue ici sous RLS. */
export async function creerAvoirClient(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, factureId: string, demandes: LigneACrediter[], motifBrut: string, date: Date = new Date()): Promise<ResultatAvoirClient> {
  const motif = motifBrut.replace(/\s+/g, " ").trim();
  if (motif.length < 3 || motif.length > 300) return { ok: false, erreur: m("Indiquez le motif de l'avoir (3 à 300 caractères).") };

  const [laFacture] = await tx.select().from(facture).where(and(eq(facture.id, factureId), eq(facture.entrepriseId, entrepriseId))).for("update");
  if (!laFacture) return { ok: false, erreur: m("Facture introuvable.") };
  if (laFacture.statut === "ANNULEE") return { ok: false, erreur: m("Cette facture est déjà annulée : on ne peut plus la créditer.") };

  const retenues = demandes.filter((d) => d.quantite > 0);
  if (retenues.length === 0) return { ok: false, erreur: m("Saisissez au moins une quantité à créditer.") };
  if (new Set(retenues.map((d) => d.ligneFactureId)).size !== retenues.length) return { ok: false, erreur: m("Une ligne ne peut apparaître qu'une fois dans l'avoir.") };

  const creditables = new Map((await lignesCreditables(tx, entrepriseId, factureId)).map((l) => [l.ligneFactureId, l]));
  for (const d of retenues) {
    const l = creditables.get(d.ligneFactureId);
    if (!l) return { ok: false, erreur: m("Une ligne ne fait pas partie de cette facture.") };
    if (!Number.isFinite(d.quantite) || arrondi2(d.quantite) !== d.quantite) return { ok: false, erreur: m("Les quantités ont au plus deux décimales.") };
    if (d.quantite > l.restant) return { ok: false, erreur: m("Une quantité dépasse ce qui reste à créditer sur sa ligne.") };
    if (d.remettreEnStock) {
      if (!l.produitId || !l.produitSuivi) return { ok: false, erreur: m("Seuls les produits dont le stock est suivi peuvent être remis en stock.") };
      if (!Number.isInteger(d.quantite)) return { ok: false, erreur: m("Des articles remis en stock doivent être en quantité entière.") };
    }
  }

  const calcul = calculerMontants(retenues.map((d) => ({ quantite: d.quantite, prixUnitaire: creditables.get(d.ligneFactureId)!.prixUnitaire, tauxTVA: creditables.get(d.ligneFactureId)!.tauxTVA })));
  if (calcul.montantTTC <= 0) return { ok: false, erreur: m("Le montant de l'avoir doit être positif.") };
  const dejaCredite = await totalAvoirsFacture(tx, factureId);
  if (dejaCredite + calcul.montantTTC > laFacture.montantTTC) return { ok: false, erreur: m("Le total des avoirs dépasse le montant de la facture.") };

  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const erreurVerrou = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, date);
  if (erreurVerrou) return { ok: false, erreur: erreurVerrou };

  const numero = await genererNumeroAvoirClient(tx, entrepriseId);
  const [avoir] = await tx
    .insert(avoirClient)
    .values({ entrepriseId, factureId, numero, motif, montantHT: calcul.montantHT, montantTVA: calcul.montantTVA, montantTTC: calcul.montantTTC, creeParId: utilisateurId })
    .returning({ id: avoirClient.id });
  await tx.insert(ligneAvoirClient).values(
    retenues.map((d) => {
      const l = creditables.get(d.ligneFactureId)!;
      return { entrepriseId, avoirId: avoir.id, ligneFactureId: l.ligneFactureId, produitId: l.produitId, designation: l.designation, quantite: d.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA, remettreEnStock: d.remettreEnStock };
    })
  );

  await genererEcrituresAvoirClient(tx, { entrepriseId, factureId, numeroAvoir: numero, numeroFacture: laFacture.numero, montantHT: calcul.montantHT, montantTVA: calcul.montantTVA, montantTTC: calcul.montantTTC, date });

  // Articles remis en stock : dans le dépôt d'où ils étaient sortis à la vente (sinon le dépôt principal).
  for (const d of retenues.filter((x) => x.remettreEnStock)) {
    const l = creditables.get(d.ligneFactureId)!;
    const [sortie] = await tx
      .select({ depotId: mouvementStock.depotId })
      .from(mouvementStock)
      .where(and(eq(mouvementStock.entrepriseId, entrepriseId), eq(mouvementStock.documentType, "FACTURE"), eq(mouvementStock.documentId, factureId), eq(mouvementStock.produitId, l.produitId!), eq(mouvementStock.type, "VENTE")))
      .limit(1);
    await entrerStockDocument(tx, entrepriseId, l.produitId!, d.quantite, { type: "AVOIR_CLIENT", id: avoir.id, depotId: sortie?.depotId ?? null, utilisateurId });
  }

  // Statut de la facture : entièrement créditée = annulée ; sinon payée dès que les règlements couvrent le net restant dû.
  const net = await montantNetFacture(tx, factureId, laFacture.montantTTC);
  const payeBrut = (await tx.select({ montant: paiement.montant }).from(paiement).where(eq(paiement.factureId, factureId))).reduce((somme, r) => somme + r.montant, 0);
  let factureAnnulee = false;
  if (net <= 0) {
    await tx.update(facture).set({ statut: "ANNULEE" }).where(eq(facture.id, factureId));
    factureAnnulee = true;
  } else if (payeBrut > 0 && payeBrut >= net && laFacture.statut !== "PAYEE") {
    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, factureId));
  }
  await resoudrePromessesFacture(tx, entrepriseId, factureId);
  return { ok: true, avoirId: avoir.id, numero, montantTTC: calcul.montantTTC, factureAnnulee };
}
