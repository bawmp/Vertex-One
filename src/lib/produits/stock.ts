import { sql, inArray, eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { depot, produit, mouvementStock, stockDepot } from "@/db/schema";
import { assurerDepotPrincipal, deplacerStockDepot, resoudreDepotDocument, resorberEcart } from "./depots";
import { blocageRuptureActif } from "./gestion-stock";
import { m } from "@/lib/i18n/catalogue";
import { MOTIFS_AJOUT, MOTIFS_RETRAIT } from "./motifs-stock";
import { consommerLotsFEFO, effacerLots, harmoniserLots } from "./lots-sortie";
import { effacerSeries, harmoniserSeries, restituerSeries, vendreSeries } from "./series-sortie";
import { reservesParProduit, stockDisponible } from "./reservations";
import { etendreKits } from "./kits-etendre";

type LigneAvecProduit = { produitId?: string | null; quantite: number; /** Prix d'achat unitaire hors taxe d'une ligne d'achat : sert au coût moyen pondéré. */ prixUnitaire?: number };

/**
 * Coût moyen pondéré après un achat (règle pure, miroir exact du calcul SQL de `ajusterStock`) : si le stock était vide ou négatif,
 * le coût devient celui de l'achat ; sinon moyenne pondérée des quantités. Arrondi à l'entier le plus proche (FCFA).
 */
export function nouveauCoutMoyen(stockAvant: number, coutAvant: number, quantiteAchetee: number, valeurAchat: number): number {
  if (quantiteAchetee <= 0) return coutAvant;
  if (stockAvant <= 0) return Math.round(valeurAchat / quantiteAchetee);
  return Math.round((stockAvant * coutAvant + valeurAchat) / (stockAvant + quantiteAchetee));
}

/** D'où vient un mouvement de vente ou d'achat : le document qui l'a provoqué (pour retrouver sa fiche) et la personne, s'il y en a une. */
export type ContexteMouvement = { documentType?: string; documentId?: string; utilisateurId?: string | null; /** Dépôt choisi sur le document (priorité 1.3) ; absent = le dépôt principal. */ depotId?: string | null; /** Numéros de série choisis à la vente, par produit (déjà contrôlés par la saisie) ; absent = les plus anciens. */ seriesChoisies?: Record<string, string[]> };

/**
 * Catalogue Produits/Tarifs (échange du 2026-09-07, zoho-books-full-spec.md
 * section 5.3) : "une vente le diminue, un achat facturé l'augmente". Ne
 * touche que les BIEN avec suiviStock actif (jamais un SERVICE, qui n'a
 * pas de stock) — filtré ici par `and(inArray(...), eq(suiviStock, true))`
 * plutôt que côté appelant, pour que toute future ligne "produit inconnu ou
 * non suivi" soit silencieusement ignorée sans que chaque appelant n'ait à
 * y penser. Pas de blocage si le stock devient négatif (vente possible même
 * en rupture) — comme Zoho, qui ne bloque pas la vente, se contente de
 * suivre le nombre.
 *
 * Depuis le 2026-11-02, chaque variation laisse une ligne dans `mouvement_stock` (quantité signée + stock obtenu). Le stock est
 * modifié par un `UPDATE … RETURNING` atomique : le « stock après » est exact même si deux ventes arrivent en même temps.
 */
async function ajusterStock(tx: TransactionDrizzle, entrepriseId: string, lignesBrutes: LigneAvecProduit[], sens: 1 | -1, contexte?: ContexteMouvement): Promise<void> {
  // Vendre un kit sort le stock de ses composants (priorité 3.9) ; un achat de kit n'entre rien (il n'a pas de stock à lui).
  const lignes = sens === -1 ? await etendreKits(tx, entrepriseId, lignesBrutes) : lignesBrutes;
  const quantitesParProduit = new Map<string, number>();
  const valeursParProduit = new Map<string, number>();
  for (const l of lignes) {
    if (!l.produitId) continue;
    quantitesParProduit.set(l.produitId, (quantitesParProduit.get(l.produitId) ?? 0) + l.quantite);
    if (l.prixUnitaire !== undefined) valeursParProduit.set(l.produitId, (valeursParProduit.get(l.produitId) ?? 0) + l.quantite * l.prixUnitaire);
  }
  if (quantitesParProduit.size === 0) return;

  const ids = [...quantitesParProduit.keys()];
  const produitsSuivis = await tx.select({ id: produit.id, suiviLots: produit.suiviLots, suiviSerie: produit.suiviSerie }).from(produit).where(and(inArray(produit.id, ids), eq(produit.suiviStock, true)));

  if (produitsSuivis.length === 0) return;
  // Les documents (ventes, achats) touchent toujours le dépôt principal ; les transferts et corrections choisissent le leur.
  const depotCible = await resoudreDepotDocument(tx, entrepriseId, contexte?.depotId);

  for (const { id, suiviLots, suiviSerie } of produitsSuivis) {
    const quantite = quantitesParProduit.get(id)!;
    if (quantite === 0) continue;
    // Achat avec prix connu : le coût moyen se recalcule dans le MÊME UPDATE (valeurs d'avant), donc sans course entre deux achats.
    const valeur = sens === 1 ? valeursParProduit.get(id) : undefined;
    const [apres] = await tx
      .update(produit)
      .set({
        stockActuel: sql`${produit.stockActuel} + ${sens * quantite}`,
        ...(valeur !== undefined
          ? {
              coutMoyen: sql`CASE WHEN ${produit.stockActuel} <= 0 THEN ROUND(${valeur}::numeric / ${quantite})::integer ELSE ROUND((${produit.stockActuel}::numeric * ${produit.coutMoyen} + ${valeur}) / (${produit.stockActuel} + ${quantite}))::integer END`,
            }
          : {}),
      })
      .where(eq(produit.id, id))
      .returning({ stockActuel: produit.stockActuel });
    await deplacerStockDepot(tx, entrepriseId, id, depotCible, sens * quantite);
    // Une vente sort d'abord les lots qui se périment le plus tôt (priorité 3.4).
    if (suiviLots && sens === -1) await consommerLotsFEFO(tx, entrepriseId, id, quantite);
    // …et emporte les numéros de série en stock les plus anciens, rattachés au document de vente.
    if (suiviSerie && sens === -1) await vendreSeries(tx, entrepriseId, id, quantite, { type: contexte?.documentType, id: contexte?.documentId }, contexte?.seriesChoisies?.[id] ?? []);
    await tx.insert(mouvementStock).values({
      entrepriseId,
      produitId: id,
      type: sens === -1 ? "VENTE" : "ACHAT",
      quantite: sens * quantite,
      stockApres: apres.stockActuel,
      depotId: depotCible,
      // Coût unitaire de ce que l'achat fait entrer : une couche pour la valorisation FIFO.
      coutUnitaire: sens === 1 && valeur !== undefined ? Math.round(valeur / quantite) : null,
      documentType: contexte?.documentType,
      documentId: contexte?.documentId,
      creeParId: contexte?.utilisateurId ?? null,
    });
  }
}

export function decrementerStockVente(tx: TransactionDrizzle, entrepriseId: string, lignes: LigneAvecProduit[], contexte?: ContexteMouvement): Promise<void> {
  return ajusterStock(tx, entrepriseId, lignes, -1, contexte);
}

/**
 * Mouvement inverse — appelé à la création d'une Facture fournisseur
 * (échange du 2026-09-07, section 5.3 : "un achat facturé l'augmente").
 * Jamais à la création d'un Bon de commande, qui n'affecte pas le stock
 * (voir schema.ts).
 */
export function incrementerStockAchat(tx: TransactionDrizzle, entrepriseId: string, lignes: LigneAvecProduit[], contexte?: ContexteMouvement): Promise<void> {
  return ajusterStock(tx, entrepriseId, lignes, 1, contexte);
}

export type CorrectionStock =
  | { mode: "AJOUT" | "RETRAIT"; quantite: number; motif: string; note?: string; depotId?: string }
  | { mode: "INVENTAIRE"; compte: number; note?: string; depotId?: string };

export type ResultatCorrection = { ok: true; stockAvant: number; stockApres: number; ecart: number } | { ok: false; erreur: string };

/**
 * Correction manuelle du stock d'un produit : entrée, sortie ou inventaire physique (on saisit ce qu'on a compté, l'écart se
 * calcule). La ligne du produit est verrouillée (`FOR UPDATE`) pour que l'écart d'un inventaire se calcule sur le stock réel du
 * moment. Un retrait ne peut jamais dépasser le stock disponible ; un inventaire peut descendre à 0, jamais en dessous. Le produit
 * est relu dans la transaction de l'entreprise (RLS) : jamais un produit d'une autre entreprise. Les messages sont des clés
 * françaises traduites par l'appelant.
 */
export async function corrigerStock(tx: TransactionDrizzle, entrepriseId: string, produitId: string, correction: CorrectionStock, utilisateurId: string): Promise<ResultatCorrection> {
  const [p] = await tx
    .select({ id: produit.id, type: produit.type, suiviStock: produit.suiviStock, stockActuel: produit.stockActuel })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)))
    .for("update");
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (p.type !== "BIEN" || !p.suiviStock) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };

  // Dépôt visé (le principal par défaut) et ce qu'il contient : un retrait ou un inventaire se mesure sur CE dépôt, pas sur le total.
  await resorberEcart(tx, entrepriseId, p.id);
  const visee = correction.depotId
    ? (await tx.select({ id: depot.id, actif: depot.actif }).from(depot).where(and(eq(depot.id, correction.depotId), eq(depot.entrepriseId, entrepriseId))))[0]
    : await assurerDepotPrincipal(tx, entrepriseId).then((d) => ({ id: d.id, actif: true }));
  if (!visee) return { ok: false, erreur: m("Dépôt introuvable.") };
  if (!visee.actif) return { ok: false, erreur: m("Un dépôt archivé ne peut pas recevoir ni envoyer de stock.") };
  const [dansDepot] = await tx.select({ quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.produitId, p.id), eq(stockDepot.depotId, visee.id)));
  const quantiteDepot = dansDepot?.quantite ?? 0;

  let delta: number;
  let type: "AJOUT" | "RETRAIT" | "INVENTAIRE";
  let motif: string;
  if (correction.mode === "INVENTAIRE") {
    if (!Number.isInteger(correction.compte) || correction.compte < 0) return { ok: false, erreur: m("La quantité comptée doit être un nombre entier, zéro ou plus.") };
    delta = correction.compte - quantiteDepot;
    type = "INVENTAIRE";
    motif = "INVENTAIRE";
  } else {
    if (!Number.isInteger(correction.quantite) || correction.quantite <= 0) return { ok: false, erreur: m("La quantité doit être un nombre entier supérieur à zéro.") };
    const motifs: Record<string, string> = correction.mode === "AJOUT" ? MOTIFS_AJOUT : MOTIFS_RETRAIT;
    if (!(correction.motif in motifs)) return { ok: false, erreur: m("Choisissez la raison de cette correction.") };
    if (correction.mode === "RETRAIT" && correction.quantite > quantiteDepot) return { ok: false, erreur: m("Vous ne pouvez pas retirer plus que le stock disponible.") };
    delta = correction.mode === "AJOUT" ? correction.quantite : -correction.quantite;
    type = correction.mode;
    motif = correction.motif;
  }
  if (delta === 0) return { ok: true, stockAvant: p.stockActuel, stockApres: p.stockActuel, ecart: 0 };

  const stockApres = p.stockActuel + delta;
  await tx.update(produit).set({ stockActuel: stockApres }).where(eq(produit.id, p.id));
  await deplacerStockDepot(tx, entrepriseId, p.id, visee.id, delta);
  if (delta < 0) {
    await harmoniserLots(tx, entrepriseId, p.id);
    await harmoniserSeries(tx, entrepriseId, p.id);
  }
  await tx.insert(mouvementStock).values({
    entrepriseId,
    produitId: p.id,
    type,
    quantite: delta,
    stockApres,
    motif,
    note: correction.note?.trim() || null,
    depotId: visee.id,
    creeParId: utilisateurId,
  });
  return { ok: true, stockAvant: p.stockActuel, stockApres, ecart: delta };
}

/** Active le suivi du stock d'un BIEN et enregistre le stock de départ (ligne « INITIAL »). Sans effet si le suivi est déjà actif. */
export async function activerSuiviStock(tx: TransactionDrizzle, entrepriseId: string, produitId: string, stockInitial: number, utilisateurId: string): Promise<ResultatCorrection> {
  if (!Number.isInteger(stockInitial) || stockInitial < 0) return { ok: false, erreur: m("La quantité en stock doit être un nombre entier, zéro ou plus.") };
  const [p] = await tx
    .select({ id: produit.id, type: produit.type, suiviStock: produit.suiviStock, prixAchat: produit.prixAchat, estKit: produit.estKit })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)))
    .for("update");
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (p.type !== "BIEN") return { ok: false, erreur: m("Un service n'a pas de stock.") };
  if (p.estKit) return { ok: false, erreur: m("Un kit n'a pas de stock à lui : son stock est celui de ses composants.") };
  if (p.suiviStock) return { ok: false, erreur: m("Le suivi du stock est déjà activé pour ce produit.") };

  await tx.update(produit).set({ suiviStock: true, stockActuel: stockInitial, coutMoyen: p.prixAchat }).where(eq(produit.id, p.id));
  const principal = await assurerDepotPrincipal(tx, entrepriseId);
  if (stockInitial > 0) await deplacerStockDepot(tx, entrepriseId, p.id, principal.id, stockInitial);
  await tx.insert(mouvementStock).values({ entrepriseId, produitId: p.id, type: "INITIAL", quantite: stockInitial, stockApres: stockInitial, depotId: principal.id, creeParId: utilisateurId });
  return { ok: true, stockAvant: 0, stockApres: stockInitial, ecart: stockInitial };
}

/**
 * Fixe (ou retire, avec `null`) le seuil d'alerte d'un bien suivi. Le produit est relu dans la transaction de l'entreprise (RLS) :
 * jamais le produit d'une autre. Un seuil est un entier de 0 à 1 000 000.
 */
export async function definirSeuilAlerte(tx: TransactionDrizzle, entrepriseId: string, produitId: string, seuil: number | null): Promise<{ ok: true; seuil: number | null } | { ok: false; erreur: string }> {
  if (seuil !== null && (!Number.isInteger(seuil) || seuil < 0 || seuil > 1_000_000)) return { ok: false, erreur: m("Le seuil doit être un nombre entier, zéro ou plus.") };
  const modifies = await tx
    .update(produit)
    .set({ seuilAlerte: seuil })
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId), eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
    .returning({ id: produit.id });
  if (modifies.length === 0) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };
  return { ok: true, seuil };
}

export type TypeDocumentStock = "FACTURE" | "RECU_VENTE" | "FACTURE_FOURNISSEUR";

/**
 * Annulation d'un document (2026-11-02) : défait les mouvements de stock qu'il avait provoqués. Une vente annulée REMET les articles
 * en stock (dans le dépôt d'où ils étaient sortis) ; un achat annulé les RETIRE. Chaque produit n'est repris qu'une fois par document
 * (une ligne « Document annulé » dans l'historique le prouve), donc annuler deux fois ne change rien. Le stock se corrige par un
 * `UPDATE` atomique, comme les ventes. Un document d'avant l'historique du stock (aucun mouvement enregistré) ne touche à rien.
 * Le coût moyen n'est pas recalculé : approximation assumée.
 */
export async function defaireMouvementsDocument(tx: TransactionDrizzle, entrepriseId: string, documentType: TypeDocumentStock, documentId: string, utilisateurId: string | null): Promise<number> {
  const mouvements = await tx
    .select()
    .from(mouvementStock)
    .where(and(eq(mouvementStock.entrepriseId, entrepriseId), eq(mouvementStock.documentType, documentType), eq(mouvementStock.documentId, documentId)));
  const originaux = mouvements.filter((mv) => mv.motif !== "ANNULATION" && (mv.type === "VENTE" || mv.type === "ACHAT"));
  if (originaux.length === 0) return 0;
  // Une annulation reprend TOUS les dépôts d'un produit d'un coup : un produit qui porte déjà une ligne « Document annulé » est défait.
  const dejaDefaits = new Set(mouvements.filter((mv) => mv.motif === "ANNULATION").map((mv) => mv.produitId));

  const groupes = new Map<string, { produitId: string; depotId: string | null; quantite: number; type: "VENTE" | "ACHAT" }>();
  for (const mv of originaux) {
    const cle = `${mv.produitId}|${mv.depotId ?? ""}`;
    if (dejaDefaits.has(mv.produitId)) continue;
    const g = groupes.get(cle) ?? { produitId: mv.produitId, depotId: mv.depotId, quantite: 0, type: mv.type as "VENTE" | "ACHAT" };
    g.quantite += mv.quantite;
    groupes.set(cle, g);
  }
  if (groupes.size === 0) return 0;

  const principal = await assurerDepotPrincipal(tx, entrepriseId);
  let defaits = 0;
  for (const g of groupes.values()) {
    const delta = -g.quantite; // une vente (−4) revient en stock (+4), un achat (+5) en ressort (−5)
    if (delta === 0) continue;
    const [p] = await tx.select({ suivi: produit.suiviStock }).from(produit).where(and(eq(produit.id, g.produitId), eq(produit.entrepriseId, entrepriseId)));
    if (!p?.suivi) continue;
    const [apres] = await tx
      .update(produit)
      .set({ stockActuel: sql`${produit.stockActuel} + ${delta}` })
      .where(eq(produit.id, g.produitId))
      .returning({ stockActuel: produit.stockActuel });
    const depotId = g.depotId ?? principal.id;
    await deplacerStockDepot(tx, entrepriseId, g.produitId, depotId, delta);
    if (delta < 0) {
      await harmoniserLots(tx, entrepriseId, g.produitId);
      await harmoniserSeries(tx, entrepriseId, g.produitId);
    }
    // Une vente annulée remet en stock les numéros de série qu'elle avait emportés.
    if (delta > 0 && g.type === "VENTE") await restituerSeries(tx, entrepriseId, g.produitId, documentType, documentId);
    await tx.insert(mouvementStock).values({
      entrepriseId,
      produitId: g.produitId,
      type: delta > 0 ? "AJOUT" : "RETRAIT",
      quantite: delta,
      stockApres: apres.stockActuel,
      motif: "ANNULATION",
      depotId: g.depotId ?? principal.id,
      documentType,
      documentId,
      creeParId: utilisateurId,
    });
    defaits++;
  }
  return defaits;
}

/**
 * Entrée de stock provoquée par un document (retour client d'un avoir partiel, 2026-11-02) : ajoute `quantite` au produit et au dépôt
 * indiqué (le principal par défaut) et laisse une ligne « Retour d'un client » dans l'historique, rattachée au document. Sans effet si
 * le produit n'est pas suivi. Le coût moyen ne change pas.
 */
export async function entrerStockDocument(tx: TransactionDrizzle, entrepriseId: string, produitId: string, quantite: number, document: { type: string; id: string; depotId: string | null; utilisateurId: string | null }): Promise<void> {
  if (!Number.isInteger(quantite) || quantite <= 0) return;
  const [p] = await tx.select({ suivi: produit.suiviStock }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
  if (!p?.suivi) return;
  const depotId = document.depotId ?? (await assurerDepotPrincipal(tx, entrepriseId)).id;
  const [apres] = await tx
    .update(produit)
    .set({ stockActuel: sql`${produit.stockActuel} + ${quantite}` })
    .where(eq(produit.id, produitId))
    .returning({ stockActuel: produit.stockActuel });
  await deplacerStockDepot(tx, entrepriseId, produitId, depotId, quantite);
  await tx.insert(mouvementStock).values({
    entrepriseId,
    produitId,
    type: "AJOUT",
    quantite,
    stockApres: apres.stockActuel,
    motif: "RETOUR_CLIENT",
    depotId,
    documentType: document.type,
    documentId: document.id,
    creeParId: document.utilisateurId,
  });
}

export type StockInsuffisant = { cle: string; valeurs: Record<string, string | number> };
export const MESSAGE_STOCK_INSUFFISANT = m("Stock insuffisant pour « {produit} » dans le dépôt « {depot} » : {disponible} disponible(s), {demande} demandé(s).");
export const MESSAGE_STOCK_RESERVE = m("Stock insuffisant pour « {produit} » dans le dépôt « {depot} » : {disponible} disponible(s) après {reserve} réservé(s) pour des commandes client, {demande} demandé(s).");

/**
 * Interdire la vente en rupture (priorité 1.4, 2026-11-02) : quand l'entreprise l'a choisi, vérifie avant une vente que le dépôt visé
 * (le principal par défaut) contient assez de chaque produit SUIVI. Les produits non suivis et les services ne sont jamais bloqués. Sans
 * le réglage, rien n'est vérifié (stock négatif toléré, comme avant). Renvoie le premier manque trouvé, ou null.
 */
export async function verifierStockSuffisant(tx: TransactionDrizzle, entrepriseId: string, lignesBrutes: LigneAvecProduit[], depotId?: string | null, options: { exclureCommandeId?: string } = {}): Promise<StockInsuffisant | null> {
  if (!(await blocageRuptureActif(tx, entrepriseId))) return null;
  const lignes = await etendreKits(tx, entrepriseId, lignesBrutes);
  const demandes = new Map<string, number>();
  for (const l of lignes) if (l.produitId) demandes.set(l.produitId, (demandes.get(l.produitId) ?? 0) + l.quantite);
  if (demandes.size === 0) return null;

  const depotCible = await resoudreDepotDocument(tx, entrepriseId, depotId);
  const [monDepot] = await tx.select({ nom: depot.nom }).from(depot).where(eq(depot.id, depotCible));
  const produits = await tx.select({ id: produit.id, nom: produit.nom }).from(produit).where(and(inArray(produit.id, [...demandes.keys()]), eq(produit.entrepriseId, entrepriseId), eq(produit.suiviStock, true)));
  // Les commandes client en cours réservent du stock (priorité 3.7) : on ne peut pas le vendre à quelqu'un d'autre. La commande qu'on est
  // en train de facturer est exclue, elle ne se réserve pas à elle-même.
  const reserves = await reservesParProduit(tx, entrepriseId, { depotId: depotCible, exclureCommandeId: options.exclureCommandeId, produitIds: produits.map((p) => p.id) });
  for (const p of produits) {
    await resorberEcart(tx, entrepriseId, p.id);
    const [ligne] = await tx.select({ quantite: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.produitId, p.id), eq(stockDepot.depotId, depotCible)));
    const enDepot = ligne?.quantite ?? 0;
    const reserve = reserves.get(p.id) ?? 0;
    const disponible = stockDisponible(enDepot, reserve);
    const demande = demandes.get(p.id)!;
    if (demande > disponible) {
      const valeurs = { produit: p.nom, depot: monDepot?.nom ?? "", disponible: Math.max(disponible, 0), demande };
      return reserve > 0 ? { cle: MESSAGE_STOCK_RESERVE, valeurs: { ...valeurs, reserve } } : { cle: MESSAGE_STOCK_INSUFFISANT, valeurs };
    }
  }
  return null;
}

/**
 * Arrête le suivi du stock d'un produit (priorité 1.5, 2026-11-02). Ce qui restait en stock SORT du suivi par une ligne « Fin du suivi »
 * par dépôt (le stock tombe à zéro, l'historique reste lisible), le produit n'est plus suivi, son seuil d'alerte est retiré. Les ventes
 * et achats suivants ne le touchent plus. Réversible : réactiver le suivi repart d'un stock de départ saisi.
 */
export async function arreterSuiviStock(tx: TransactionDrizzle, entrepriseId: string, produitId: string, utilisateurId: string): Promise<{ ok: true; retires: number } | { ok: false; erreur: string }> {
  const [p] = await tx
    .select({ id: produit.id, type: produit.type, suivi: produit.suiviStock, stock: produit.stockActuel })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)))
    .for("update");
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (p.type !== "BIEN" || !p.suivi) return { ok: false, erreur: m("Le suivi du stock n'est pas activé pour ce produit.") };

  await resorberEcart(tx, entrepriseId, produitId);
  const parDepot = await tx.select({ depotId: stockDepot.depotId, quantite: stockDepot.quantite }).from(stockDepot).where(eq(stockDepot.produitId, produitId));
  let reste = p.stock;
  for (const d of parDepot) {
    if (d.quantite === 0) continue;
    reste -= d.quantite;
    await tx.insert(mouvementStock).values({ entrepriseId, produitId, type: "RETRAIT", quantite: -d.quantite, stockApres: reste, motif: "FIN_SUIVI", depotId: d.depotId, creeParId: utilisateurId });
  }
  await tx.delete(stockDepot).where(eq(stockDepot.produitId, produitId));
  await effacerLots(tx, entrepriseId, [produitId]);
  await effacerSeries(tx, entrepriseId, [produitId]);
  await tx.update(produit).set({ suiviStock: false, stockActuel: 0, seuilAlerte: null, suiviLots: false, suiviSerie: false }).where(eq(produit.id, produitId));
  return { ok: true, retires: p.stock };
}
