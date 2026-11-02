import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lotStock, produit } from "@/db/schema";
import { aujourdhuiDouala, estJourValide } from "@/lib/facturation/promesse-regles";
import { m } from "@/lib/i18n/catalogue";
import { effacerLots } from "./lots-sortie";
import { joursAvant, ordreFEFO, statutPeremption, JOURS_ALERTE_PEREMPTION, type StatutPeremption } from "./lots-regles";
import { MOTIFS_RETRAIT } from "./motifs-stock";
import { corrigerStock } from "./stock";

export type ResultatLot = { ok: true } | { ok: false; erreur: string };

export type LotLisible = { id: string; numeroLot: string; datePeremption: string | null; quantite: number; statut: StatutPeremption; jours: number | null };

/** Les lots d'un produit dans l'ordre de sortie, et ce qui reste de stock sans lot. */
export async function lireLots(tx: TransactionDrizzle, entrepriseId: string, produitId: string, aujourdhui: string = aujourdhuiDouala()): Promise<{ suiviLots: boolean; stock: number; lots: LotLisible[]; sansLot: number } | null> {
  const [p] = await tx.select({ stock: produit.stockActuel, suiviLots: produit.suiviLots }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return null;
  const lignes = await tx
    .select({ id: lotStock.id, numeroLot: lotStock.numeroLot, datePeremption: lotStock.datePeremption, quantite: lotStock.quantite, creeLe: lotStock.creeLe })
    .from(lotStock)
    .where(and(eq(lotStock.entrepriseId, entrepriseId), eq(lotStock.produitId, produitId), gt(lotStock.quantite, 0)));
  const lots = ordreFEFO(lignes, aujourdhui).map((l) => ({
    id: l.id,
    numeroLot: l.numeroLot,
    datePeremption: l.datePeremption,
    quantite: l.quantite,
    statut: statutPeremption(l.datePeremption, aujourdhui),
    jours: l.datePeremption ? joursAvant(l.datePeremption, aujourdhui) : null,
  }));
  const somme = lots.reduce((s, l) => s + l.quantite, 0);
  return { suiviLots: p.suiviLots, stock: p.stock, lots, sansLot: Math.max(p.stock - somme, 0) };
}

/** Active ou coupe le suivi par lots d'un bien suivi en stock. Couper efface les lots (le stock, lui, ne change pas). */
export async function definirSuiviLots(tx: TransactionDrizzle, entrepriseId: string, produitId: string, actif: boolean): Promise<ResultatLot> {
  const modifies = await tx
    .update(produit)
    .set({ suiviLots: actif })
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
    .returning({ id: produit.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  if (!actif) await effacerLots(tx, entrepriseId, [produitId]);
  return { ok: true };
}

export type NouveauLot = { produitId: string; numeroLot: string; datePeremption: string | null; quantite: number; origine: "STOCK" | "ENTREE" };

/**
 * Ajoute un lot. `STOCK` : la quantité est déjà en stock (marchandise reçue avant les lots) et doit tenir dans ce qui est « sans lot ».
 * `ENTREE` : la marchandise arrive maintenant, le stock augmente (ligne « Réception de marchandise »). Un numéro de lot déjà connu pour ce
 * produit reçoit la quantité en plus, à condition que la date soit la même (ou non renseignée).
 */
export async function ajouterLot(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, l: NouveauLot): Promise<ResultatLot> {
  const numero = l.numeroLot.trim().replace(/\s+/g, " ");
  if (numero.length < 1 || numero.length > 40) return { ok: false, erreur: m("Le numéro de lot doit faire entre 1 et 40 caractères.") };
  if (l.datePeremption !== null && !estJourValide(l.datePeremption)) return { ok: false, erreur: m("Date de péremption invalide.") };
  if (!Number.isInteger(l.quantite) || l.quantite <= 0 || l.quantite > 10_000_000) return { ok: false, erreur: m("La quantité doit être un nombre entier supérieur à zéro.") };

  const etat = await lireLots(tx, entrepriseId, l.produitId);
  if (!etat) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  if (!etat.suiviLots) return { ok: false, erreur: m("Le suivi par lots n'est pas activé pour ce produit.") };

  const existant = etat.lots.find((x) => x.numeroLot.toLowerCase() === numero.toLowerCase());
  if (existant && l.datePeremption && existant.datePeremption && existant.datePeremption !== l.datePeremption) return { ok: false, erreur: m("Ce numéro de lot existe déjà avec une autre date de péremption.") };

  if (l.origine === "STOCK") {
    if (l.quantite > etat.sansLot) return { ok: false, erreur: m("Il n'y a pas autant de stock sans lot : indiquez une quantité plus petite, ou choisissez « nouvelle entrée ».") };
  } else {
    const r = await corrigerStock(tx, entrepriseId, l.produitId, { mode: "AJOUT", quantite: l.quantite, motif: "RECEPTION", note: `Lot ${numero}` }, utilisateurId);
    if (!r.ok) return { ok: false, erreur: r.erreur };
  }

  if (existant) {
    await tx
      .update(lotStock)
      .set({ quantite: existant.quantite + l.quantite, ...(l.datePeremption && !existant.datePeremption ? { datePeremption: l.datePeremption } : {}) })
      .where(eq(lotStock.id, existant.id));
  } else {
    // Un lot épuisé (quantité 0) garde son numéro : on le réutilise plutôt que de heurter l'index unique.
    const [vide] = await tx.select({ id: lotStock.id }).from(lotStock).where(and(eq(lotStock.produitId, l.produitId), sql`lower(${lotStock.numeroLot}) = ${numero.toLowerCase()}`));
    if (vide) await tx.update(lotStock).set({ quantite: l.quantite, datePeremption: l.datePeremption }).where(eq(lotStock.id, vide.id));
    else await tx.insert(lotStock).values({ entrepriseId, produitId: l.produitId, numeroLot: numero, datePeremption: l.datePeremption, quantite: l.quantite });
  }
  return { ok: true };
}

export async function modifierPeremption(tx: TransactionDrizzle, entrepriseId: string, lotId: string, datePeremption: string | null): Promise<ResultatLot> {
  if (datePeremption !== null && !estJourValide(datePeremption)) return { ok: false, erreur: m("Date de péremption invalide.") };
  const modifies = await tx.update(lotStock).set({ datePeremption }).where(and(eq(lotStock.id, lotId), eq(lotStock.entrepriseId, entrepriseId))).returning({ id: lotStock.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Lot introuvable.") };
  return { ok: true };
}

/**
 * Retire un lot entier du stock (périmé, abîmé…) : le lot disparaît et le stock du produit diminue d'autant, avec une ligne dans
 * l'historique (motif choisi dans la liste fermée des sorties). Si la sortie de stock est refusée, le lot est rétabli.
 */
export async function retirerLot(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, lotId: string, motif: string): Promise<ResultatLot> {
  if (!(motif in MOTIFS_RETRAIT)) return { ok: false, erreur: m("Choisissez la raison de cette correction.") };
  const [lot] = await tx.select().from(lotStock).where(and(eq(lotStock.id, lotId), eq(lotStock.entrepriseId, entrepriseId)));
  if (!lot || lot.quantite <= 0) return { ok: false, erreur: m("Lot introuvable.") };

  await tx.delete(lotStock).where(eq(lotStock.id, lot.id));
  const r = await corrigerStock(tx, entrepriseId, lot.produitId, { mode: "RETRAIT", quantite: lot.quantite, motif, note: `Lot ${lot.numeroLot}` }, utilisateurId);
  if (!r.ok) {
    await tx.insert(lotStock).values(lot);
    return { ok: false, erreur: r.erreur };
  }
  return { ok: true };
}

export type LignePeremption = { lotId: string; produitId: string; produit: string; numeroLot: string; datePeremption: string; quantite: number; statut: "PERIME" | "BIENTOT"; jours: number; valeur: number };

/** Les lots périmés ou qui le seront dans les `jours` prochains jours, le plus pressé en premier. */
export async function lirePeremptions(tx: TransactionDrizzle, entrepriseId: string, jours: number = JOURS_ALERTE_PEREMPTION, aujourdhui: string = aujourdhuiDouala()): Promise<LignePeremption[]> {
  const lignes = await tx
    .select({ lotId: lotStock.id, produitId: produit.id, produit: produit.nom, numeroLot: lotStock.numeroLot, datePeremption: lotStock.datePeremption, quantite: lotStock.quantite, coutMoyen: produit.coutMoyen })
    .from(lotStock)
    .innerJoin(produit, eq(lotStock.produitId, produit.id))
    .where(and(eq(lotStock.entrepriseId, entrepriseId), eq(produit.entrepriseId, entrepriseId), eq(produit.suiviLots, true), gt(lotStock.quantite, 0)))
    .orderBy(asc(lotStock.datePeremption));
  const retenues: LignePeremption[] = [];
  for (const l of lignes) {
    if (!l.datePeremption) continue;
    const statut = statutPeremption(l.datePeremption, aujourdhui, jours);
    if (statut !== "PERIME" && statut !== "BIENTOT") continue;
    retenues.push({ lotId: l.lotId, produitId: l.produitId, produit: l.produit, numeroLot: l.numeroLot, datePeremption: l.datePeremption, quantite: l.quantite, statut, jours: joursAvant(l.datePeremption, aujourdhui), valeur: l.quantite * l.coutMoyen });
  }
  return retenues;
}
