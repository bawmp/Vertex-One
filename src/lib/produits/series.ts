import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { numeroSerie, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { echapperMotifRecherche } from "@/lib/messagerie/mentions";
import { MOTIFS_RETRAIT } from "./motifs-stock";
import { effacerSeries } from "./series-sortie";
import { MAX_SERIES_PAR_SAISIE, lireSeries as lireListeSeries, normaliserSerie, type StatutSerie } from "./series-regles";
import { corrigerStock } from "./stock";

export type ResultatSerie = { ok: true; ajoutes?: number } | { ok: false; erreur: string };

export type SerieLisible = { id: string; numero: string; statut: StatutSerie; entreLe: Date; venduLe: Date | null; documentType: string | null; documentId: string | null };

const LIMITE_LISTE = 300;

/** Les numéros de série d'un produit (en stock d'abord, puis vendus et retirés) et ce qui reste de stock sans numéro. */
export async function lireSeriesProduit(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<{ suiviSerie: boolean; suiviLots: boolean; stock: number; series: SerieLisible[]; enStock: number; sansNumero: number } | null> {
  const [p] = await tx.select({ stock: produit.stockActuel, suiviSerie: produit.suiviSerie, suiviLots: produit.suiviLots }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return null;
  const series = (await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, statut: numeroSerie.statut, entreLe: numeroSerie.entreLe, venduLe: numeroSerie.venduLe, documentType: numeroSerie.documentType, documentId: numeroSerie.documentId })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId)))
    .orderBy(sql`case ${numeroSerie.statut} when 'EN_STOCK' then 0 when 'VENDU' then 1 else 2 end`, asc(numeroSerie.numero))
    .limit(LIMITE_LISTE)) as SerieLisible[];
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "EN_STOCK")));
  return { suiviSerie: p.suiviSerie, suiviLots: p.suiviLots, stock: p.stock, series, enStock: n, sansNumero: Math.max(p.stock - n, 0) };
}

/** Active ou coupe le suivi par numéro de série d'un bien suivi en stock (jamais en même temps que les lots). Couper efface les numéros ; le stock ne change pas. */
export async function definirSuiviSerie(tx: TransactionDrizzle, entrepriseId: string, produitId: string, actif: boolean): Promise<ResultatSerie> {
  const [p] = await tx.select({ id: produit.id, suiviLots: produit.suiviLots }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  if (actif && p.suiviLots) return { ok: false, erreur: m("Ce produit suit déjà ses lots : désactivez le suivi par lots avant d'activer les numéros de série.") };
  await tx.update(produit).set({ suiviSerie: actif }).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!actif) await effacerSeries(tx, entrepriseId, [produitId]);
  return { ok: true };
}

/**
 * Ajoute des numéros de série (liste collée). `STOCK` : les unités sont déjà en stock et doivent tenir dans ce qui n'a pas encore de numéro.
 * `ENTREE` : la marchandise arrive maintenant, le stock augmente d'autant (ligne « Réception de marchandise »). Un numéro déjà connu pour ce
 * produit, quel que soit son état, est refusé : jamais deux unités avec le même numéro.
 */
export async function ajouterSeries(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, produitId: string, texte: string, origine: "STOCK" | "ENTREE"): Promise<ResultatSerie> {
  const lecture = lireListeSeries(texte);
  if (lecture.invalides.length > 0) return { ok: false, erreur: m("Un numéro de série fait 60 caractères au plus.") };
  if (lecture.numeros.length === 0) return { ok: false, erreur: m("Saisissez au moins un numéro de série.") };
  if (lecture.numeros.length > MAX_SERIES_PAR_SAISIE) return { ok: false, erreur: m("500 numéros de série au plus à la fois.") };

  const etat = await lireSeriesProduit(tx, entrepriseId, produitId);
  if (!etat) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  if (!etat.suiviSerie) return { ok: false, erreur: m("Le suivi par numéro de série n'est pas activé pour ce produit.") };

  const connus = await tx.select({ numero: numeroSerie.numero }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId)));
  const dejaLa = new Set(connus.map((c) => c.numero));
  if (lecture.numeros.some((n) => dejaLa.has(n))) return { ok: false, erreur: m("Un de ces numéros existe déjà pour ce produit.") };

  const n = lecture.numeros.length;
  if (origine === "STOCK") {
    if (n > etat.sansNumero) return { ok: false, erreur: m("Il n'y a pas autant d'unités sans numéro : saisissez moins de numéros, ou choisissez « nouvelle entrée ».") };
  } else {
    const r = await corrigerStock(tx, entrepriseId, produitId, { mode: "AJOUT", quantite: n, motif: "RECEPTION", note: "Numéros de série" }, utilisateurId);
    if (!r.ok) return { ok: false, erreur: r.erreur };
  }
  await tx.insert(numeroSerie).values(lecture.numeros.map((numero) => ({ entrepriseId, produitId, numero })));
  return { ok: true, ajoutes: n };
}

/** Sort une unité du stock (casse, perte…) : son numéro passe à « retiré » et le stock diminue de un, avec une ligne dans l'historique. */
export async function retirerSerie(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, serieId: string, motif: string): Promise<ResultatSerie> {
  if (!(motif in MOTIFS_RETRAIT)) return { ok: false, erreur: m("Choisissez la raison de cette correction.") };
  const [s] = await tx.select().from(numeroSerie).where(and(eq(numeroSerie.id, serieId), eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.statut, "EN_STOCK")));
  if (!s) return { ok: false, erreur: m("Numéro de série introuvable ou pas en stock.") };
  // Marqué retiré AVANT la sortie de stock : l'harmonisation ne trouve alors aucun excédent à retirer à sa place.
  await tx.update(numeroSerie).set({ statut: "RETIRE" }).where(eq(numeroSerie.id, s.id));
  const r = await corrigerStock(tx, entrepriseId, s.produitId, { mode: "RETRAIT", quantite: 1, motif, note: `N° ${s.numero}` }, utilisateurId);
  if (!r.ok) {
    await tx.update(numeroSerie).set({ statut: "EN_STOCK" }).where(eq(numeroSerie.id, s.id));
    return { ok: false, erreur: r.erreur };
  }
  return { ok: true };
}

/** Remet en stock une unité vendue (retour d'un client) ou retirée (retrouvée) : le stock augmente de un. */
export async function remettreSerieEnStock(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, serieId: string): Promise<ResultatSerie> {
  const [s] = await tx.select().from(numeroSerie).where(and(eq(numeroSerie.id, serieId), eq(numeroSerie.entrepriseId, entrepriseId)));
  if (!s || s.statut === "EN_STOCK") return { ok: false, erreur: m("Numéro de série introuvable ou déjà en stock.") };
  const r = await corrigerStock(tx, entrepriseId, s.produitId, { mode: "AJOUT", quantite: 1, motif: s.statut === "VENDU" ? "RETOUR_CLIENT" : "TROUVE", note: `N° ${s.numero}` }, utilisateurId);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  await tx.update(numeroSerie).set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null }).where(eq(numeroSerie.id, s.id));
  return { ok: true };
}

export type ResultatRecherche = { id: string; numero: string; statut: StatutSerie; produitId: string; produit: string; entreLe: Date; venduLe: Date | null; documentType: string | null; documentId: string | null };

/** Retrouve un numéro de série (en entier ou en partie) parmi tous les produits : où il est, quand il est entré, à quel document il a été vendu. */
export async function rechercherSeries(tx: TransactionDrizzle, entrepriseId: string, saisie: string): Promise<ResultatRecherche[]> {
  const q = normaliserSerie(saisie);
  if (q.length < 2) return [];
  return (await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, statut: numeroSerie.statut, produitId: produit.id, produit: produit.nom, entreLe: numeroSerie.entreLe, venduLe: numeroSerie.venduLe, documentType: numeroSerie.documentType, documentId: numeroSerie.documentId })
    .from(numeroSerie)
    .innerJoin(produit, eq(numeroSerie.produitId, produit.id))
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), ilike(numeroSerie.numero, `%${echapperMotifRecherche(q)}%`)))
    .orderBy(desc(numeroSerie.entreLe))
    .limit(100)) as ResultatRecherche[];
}
