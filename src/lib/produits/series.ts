import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { numeroSerie, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { echapperMotifRecherche } from "@/lib/messagerie/mentions";
import { MOTIFS_RETRAIT } from "./motifs-stock";
import { effacerSeries } from "./series-sortie";
import { MAX_SERIES_PAR_SAISIE, dureeGarantieValide, lireSeries as lireListeSeries, normaliserSerie, joursAvantFinGarantie, remplacementPossible, type StatutSerie } from "./series-regles";
import { corrigerStock } from "./stock";

export type ResultatSerie = { ok: true; ajoutes?: number } | { ok: false; erreur: string };

export type SerieLisible = { id: string; numero: string; statut: StatutSerie; entreLe: Date; venduLe: Date | null; documentType: string | null; documentId: string | null; garantieFin: string | null };

const LIMITE_LISTE = 300;

/** Les numéros de série d'un produit (en stock d'abord, puis vendus et retirés) et ce qui reste de stock sans numéro. */
export async function lireSeriesProduit(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<{ suiviSerie: boolean; suiviLots: boolean; stock: number; series: SerieLisible[]; enStock: number; sansNumero: number; dureeGarantieMois: number | null } | null> {
  const [p] = await tx.select({ stock: produit.stockActuel, suiviSerie: produit.suiviSerie, suiviLots: produit.suiviLots, dureeGarantieMois: produit.dureeGarantieMois }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return null;
  const series = (await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, statut: numeroSerie.statut, entreLe: numeroSerie.entreLe, venduLe: numeroSerie.venduLe, documentType: numeroSerie.documentType, documentId: numeroSerie.documentId, garantieFin: numeroSerie.garantieFin })
    .from(numeroSerie)
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId)))
    .orderBy(sql`case ${numeroSerie.statut} when 'EN_STOCK' then 0 when 'VENDU' then 1 else 2 end`, asc(numeroSerie.numero))
    .limit(LIMITE_LISTE)) as SerieLisible[];
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, produitId), eq(numeroSerie.statut, "EN_STOCK")));
  return { suiviSerie: p.suiviSerie, suiviLots: p.suiviLots, stock: p.stock, series, enStock: n, sansNumero: Math.max(p.stock - n, 0), dureeGarantieMois: p.dureeGarantieMois };
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
  await tx.update(numeroSerie).set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null, garantieFin: null }).where(eq(numeroSerie.id, s.id));
  return { ok: true };
}

export type ResultatRecherche = { id: string; numero: string; statut: StatutSerie; produitId: string; produit: string; entreLe: Date; venduLe: Date | null; documentType: string | null; documentId: string | null; garantieFin: string | null };

/** Retrouve un numéro de série (en entier ou en partie) parmi tous les produits : où il est, quand il est entré, à quel document il a été vendu. */
export async function rechercherSeries(tx: TransactionDrizzle, entrepriseId: string, saisie: string): Promise<ResultatRecherche[]> {
  const q = normaliserSerie(saisie);
  if (q.length < 2) return [];
  return (await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, statut: numeroSerie.statut, produitId: produit.id, produit: produit.nom, entreLe: numeroSerie.entreLe, venduLe: numeroSerie.venduLe, documentType: numeroSerie.documentType, documentId: numeroSerie.documentId, garantieFin: numeroSerie.garantieFin })
    .from(numeroSerie)
    .innerJoin(produit, eq(numeroSerie.produitId, produit.id))
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), ilike(numeroSerie.numero, `%${echapperMotifRecherche(q)}%`)))
    .orderBy(desc(numeroSerie.entreLe))
    .limit(100)) as ResultatRecherche[];
}

export type SerieDeDocument = { id: string; numero: string; produitId: string; produit: string; disponibles: { id: string; numero: string }[] };

/** Numéros vendus par une facture, avec pour chacun les numéros du même produit encore en stock par lesquels on peut le remplacer. */
export async function seriesDeDocument(tx: TransactionDrizzle, entrepriseId: string, documentType: string, documentId: string): Promise<SerieDeDocument[]> {
  const vendus = await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, produitId: numeroSerie.produitId, produit: produit.nom })
    .from(numeroSerie)
    .innerJoin(produit, eq(numeroSerie.produitId, produit.id))
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.statut, "VENDU"), eq(numeroSerie.documentType, documentType), eq(numeroSerie.documentId, documentId)))
    .orderBy(asc(produit.nom), asc(numeroSerie.numero));
  const out: SerieDeDocument[] = [];
  const cache = new Map<string, { id: string; numero: string }[]>();
  for (const v of vendus) {
    if (!cache.has(v.produitId)) {
      cache.set(v.produitId, await tx.select({ id: numeroSerie.id, numero: numeroSerie.numero }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, v.produitId), eq(numeroSerie.statut, "EN_STOCK"))).orderBy(asc(numeroSerie.numero)).limit(LIMITE_LISTE));
    }
    out.push({ ...v, disponibles: cache.get(v.produitId)! });
  }
  return out;
}

/**
 * Change le numéro de série vendu : l'ancien redevient « en stock », le nouveau (du même produit, en stock) prend sa place sur le
 * document. Le stock ne change pas. Les deux numéros sont relus dans l'entreprise de la session.
 */
export async function remplacerSerieVendue(tx: TransactionDrizzle, entrepriseId: string, venduId: string, nouveauId: string): Promise<ResultatSerie> {
  const lire = async (id: string) => (await tx.select().from(numeroSerie).where(and(eq(numeroSerie.id, id), eq(numeroSerie.entrepriseId, entrepriseId))).for("update"))[0];
  const vendu = await lire(venduId);
  const nouveau = await lire(nouveauId);
  if (!vendu || !nouveau) return { ok: false, erreur: m("Numéro de série introuvable.") };
  if (!remplacementPossible(vendu, nouveau, venduId)) return { ok: false, erreur: m("Ce numéro ne peut pas être échangé : il faut un numéro en stock du même produit.") };
  await tx.update(numeroSerie).set({ statut: "VENDU", venduLe: vendu.venduLe, documentType: vendu.documentType, documentId: vendu.documentId, garantieFin: vendu.garantieFin }).where(eq(numeroSerie.id, nouveauId));
  await tx.update(numeroSerie).set({ statut: "EN_STOCK", venduLe: null, documentType: null, documentId: null, garantieFin: null }).where(eq(numeroSerie.id, venduId));
  return { ok: true };
}

/** Durée de garantie d'un produit suivi par numéro de série (en mois, `null` pour ne plus suivre de garantie). Ne touche pas les garanties déjà courantes. */
export async function definirDureeGarantie(tx: TransactionDrizzle, entrepriseId: string, produitId: string, mois: number | null): Promise<ResultatSerie> {
  if (mois !== null && !dureeGarantieValide(mois)) return { ok: false, erreur: m("La garantie est un nombre entier de mois, de 1 à 120.") };
  const [p] = await tx.select({ id: produit.id, suiviSerie: produit.suiviSerie }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)));
  if (!p) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  if (!p.suiviSerie) return { ok: false, erreur: m("Le suivi par numéro de série n'est pas activé pour ce produit.") };
  await tx.update(produit).set({ dureeGarantieMois: mois }).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  return { ok: true };
}

export type GarantieSuivie = { id: string; numero: string; produitId: string; produit: string; venduLe: Date | null; garantieFin: string; documentType: string | null; documentId: string | null };

/** Garanties qui se terminent dans les `jours` prochains jours ou sont terminées depuis moins de `jours` jours (unités vendues), les plus proches de la fin d'abord. */
export async function garantiesASurveiller(tx: TransactionDrizzle, entrepriseId: string, aujourdhui: string, jours = 30): Promise<GarantieSuivie[]> {
  const lignes = await tx
    .select({ id: numeroSerie.id, numero: numeroSerie.numero, produitId: produit.id, produit: produit.nom, venduLe: numeroSerie.venduLe, garantieFin: numeroSerie.garantieFin, documentType: numeroSerie.documentType, documentId: numeroSerie.documentId })
    .from(numeroSerie)
    .innerJoin(produit, eq(numeroSerie.produitId, produit.id))
    .where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.statut, "VENDU"), sql`${numeroSerie.garantieFin} is not null`))
    .orderBy(asc(numeroSerie.garantieFin))
    .limit(500);
  return (lignes as (Omit<GarantieSuivie, "garantieFin"> & { garantieFin: string | null })[])
    .filter((l) => l.garantieFin !== null && (joursAvantFinGarantie(l.garantieFin, aujourdhui) ?? Infinity) <= jours && (joursAvantFinGarantie(l.garantieFin, aujourdhui) ?? -Infinity) >= -jours)
    .map((l) => ({ ...l, garantieFin: l.garantieFin! }));
}

export type DemandeSeries = { produitId: string; quantite: number; numeros: string[] };

/**
 * Contrôle des numéros de série choisis à la vente, AVANT toute écriture : le produit suit ses numéros, on n'en choisit pas plus que d'unités
 * vendues, et chaque numéro est bien en stock pour CE produit (de cette entreprise). Renvoie un message clair ou null si tout est bon.
 */
export async function validerSeriesChoisies(tx: TransactionDrizzle, entrepriseId: string, demandes: DemandeSeries[]): Promise<string | null> {
  for (const d of demandes) {
    if (d.numeros.length === 0) continue;
    const [p] = await tx.select({ nom: produit.nom, suiviSerie: produit.suiviSerie }).from(produit).where(and(eq(produit.id, d.produitId), eq(produit.entrepriseId, entrepriseId)));
    if (!p?.suiviSerie) return m("Ce produit ne suit pas ses numéros de série.");
    if (d.numeros.length > Math.ceil(d.quantite)) return m("Vous avez choisi plus de numéros de série que d'unités vendues.");
    if (new Set(d.numeros).size !== d.numeros.length) return m("Un numéro de série est saisi deux fois.");
    const enStock = await tx.select({ numero: numeroSerie.numero }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.produitId, d.produitId), eq(numeroSerie.statut, "EN_STOCK")));
    const dispo = new Set(enStock.map((x) => x.numero));
    if (d.numeros.some((n) => !dispo.has(n))) return m("Un numéro de série choisi n'est pas en stock pour ce produit.");
  }
  return null;
}

/** Numéros en stock des produits donnés (pour proposer la saisie), au plus `limite` par produit, dans l'ordre. */
export async function seriesEnStockParProduit(tx: TransactionDrizzle, entrepriseId: string, produitIds: string[], limite = 200): Promise<Record<string, string[]>> {
  const par: Record<string, string[]> = {};
  if (produitIds.length === 0) return par;
  const lignes = await tx.select({ produitId: numeroSerie.produitId, numero: numeroSerie.numero }).from(numeroSerie).where(and(eq(numeroSerie.entrepriseId, entrepriseId), eq(numeroSerie.statut, "EN_STOCK"), inArray(numeroSerie.produitId, produitIds))).orderBy(asc(numeroSerie.numero)).limit(produitIds.length * limite);
  for (const l of lignes) if ((par[l.produitId] ??= []).length < limite) par[l.produitId].push(l.numero);
  return par;
}
