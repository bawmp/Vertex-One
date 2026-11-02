import { sql, inArray, eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { produit, mouvementStock } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { MOTIFS_AJOUT, MOTIFS_RETRAIT } from "./motifs-stock";

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
export type ContexteMouvement = { documentType?: string; documentId?: string; utilisateurId?: string | null };

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
async function ajusterStock(tx: TransactionDrizzle, entrepriseId: string, lignes: LigneAvecProduit[], sens: 1 | -1, contexte?: ContexteMouvement): Promise<void> {
  const quantitesParProduit = new Map<string, number>();
  const valeursParProduit = new Map<string, number>();
  for (const l of lignes) {
    if (!l.produitId) continue;
    quantitesParProduit.set(l.produitId, (quantitesParProduit.get(l.produitId) ?? 0) + l.quantite);
    if (l.prixUnitaire !== undefined) valeursParProduit.set(l.produitId, (valeursParProduit.get(l.produitId) ?? 0) + l.quantite * l.prixUnitaire);
  }
  if (quantitesParProduit.size === 0) return;

  const ids = [...quantitesParProduit.keys()];
  const produitsSuivis = await tx.select({ id: produit.id }).from(produit).where(and(inArray(produit.id, ids), eq(produit.suiviStock, true)));

  for (const { id } of produitsSuivis) {
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
    await tx.insert(mouvementStock).values({
      entrepriseId,
      produitId: id,
      type: sens === -1 ? "VENTE" : "ACHAT",
      quantite: sens * quantite,
      stockApres: apres.stockActuel,
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
  | { mode: "AJOUT" | "RETRAIT"; quantite: number; motif: string; note?: string }
  | { mode: "INVENTAIRE"; compte: number; note?: string };

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

  let delta: number;
  let type: "AJOUT" | "RETRAIT" | "INVENTAIRE";
  let motif: string;
  if (correction.mode === "INVENTAIRE") {
    if (!Number.isInteger(correction.compte) || correction.compte < 0) return { ok: false, erreur: m("La quantité comptée doit être un nombre entier, zéro ou plus.") };
    delta = correction.compte - p.stockActuel;
    type = "INVENTAIRE";
    motif = "INVENTAIRE";
  } else {
    if (!Number.isInteger(correction.quantite) || correction.quantite <= 0) return { ok: false, erreur: m("La quantité doit être un nombre entier supérieur à zéro.") };
    const motifs: Record<string, string> = correction.mode === "AJOUT" ? MOTIFS_AJOUT : MOTIFS_RETRAIT;
    if (!(correction.motif in motifs)) return { ok: false, erreur: m("Choisissez la raison de cette correction.") };
    if (correction.mode === "RETRAIT" && correction.quantite > p.stockActuel) return { ok: false, erreur: m("Vous ne pouvez pas retirer plus que le stock disponible.") };
    delta = correction.mode === "AJOUT" ? correction.quantite : -correction.quantite;
    type = correction.mode;
    motif = correction.motif;
  }
  if (delta === 0) return { ok: true, stockAvant: p.stockActuel, stockApres: p.stockActuel, ecart: 0 };

  const stockApres = p.stockActuel + delta;
  await tx.update(produit).set({ stockActuel: stockApres }).where(eq(produit.id, p.id));
  await tx.insert(mouvementStock).values({
    entrepriseId,
    produitId: p.id,
    type,
    quantite: delta,
    stockApres,
    motif,
    note: correction.note?.trim() || null,
    creeParId: utilisateurId,
  });
  return { ok: true, stockAvant: p.stockActuel, stockApres, ecart: delta };
}

/** Active le suivi du stock d'un BIEN et enregistre le stock de départ (ligne « INITIAL »). Sans effet si le suivi est déjà actif. */
export async function activerSuiviStock(tx: TransactionDrizzle, entrepriseId: string, produitId: string, stockInitial: number, utilisateurId: string): Promise<ResultatCorrection> {
  if (!Number.isInteger(stockInitial) || stockInitial < 0) return { ok: false, erreur: m("La quantité en stock doit être un nombre entier, zéro ou plus.") };
  const [p] = await tx
    .select({ id: produit.id, type: produit.type, suiviStock: produit.suiviStock, prixAchat: produit.prixAchat })
    .from(produit)
    .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)))
    .for("update");
  if (!p) return { ok: false, erreur: m("Produit introuvable.") };
  if (p.type !== "BIEN") return { ok: false, erreur: m("Un service n'a pas de stock.") };
  if (p.suiviStock) return { ok: false, erreur: m("Le suivi du stock est déjà activé pour ce produit.") };

  await tx.update(produit).set({ suiviStock: true, stockActuel: stockInitial, coutMoyen: p.prixAchat }).where(eq(produit.id, p.id));
  await tx.insert(mouvementStock).values({ entrepriseId, produitId: p.id, type: "INITIAL", quantite: stockInitial, stockApres: stockInitial, creeParId: utilisateurId });
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
