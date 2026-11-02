import { and, eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, produit } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";

/**
 * Entreprise de produits ou de services (2026-11-02). Une entreprise de services ne voit rien du stock : ni suivi par produit, ni
 * inventaire, ni dépôts, ni valeur, ni alertes. Une entreprise de produits (secteur « Commerce » à l'inscription, ou case cochée dans
 * Paramètres → Entreprise) a tout. Le réglage vit sur `entreprise.gere_stock` ; chaque action de stock le revérifie côté serveur,
 * jamais seulement dans l'interface. Les ventes et achats des documents continuent de suivre le stock des produits déjà suivis.
 */

/** Message à renvoyer (traduit par l'appelant) quand une action de stock est demandée sur une entreprise de services. */
export const MESSAGE_STOCK_DESACTIVE = m("La gestion de stock n'est pas activée pour votre entreprise : activez-la dans Paramètres → Entreprise.");

export async function gestionStockActive(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  const [e] = await tx.select({ gereStock: entreprise.gereStock }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return e?.gereStock === true;
}

export type ResultatGestionStock = { ok: true; active: boolean } | { ok: false; erreur: string };

/**
 * Active ou désactive la gestion de stock. On ne peut la désactiver que si aucun produit n'est encore suivi en stock : sinon les
 * ventes continueraient de bouger un stock que plus personne ne voit.
 */
export async function modifierGestionStock(tx: TransactionDrizzle, entrepriseId: string, activer: boolean): Promise<ResultatGestionStock> {
  if (!activer) {
    const [suivi] = await tx.select({ n: sql<number>`count(*)::int` }).from(produit).where(and(eq(produit.entrepriseId, entrepriseId), eq(produit.suiviStock, true)));
    if ((suivi?.n ?? 0) > 0) return { ok: false, erreur: m("Le stock de certains produits est encore suivi : on ne peut pas désactiver la gestion de stock.") };
  }
  const modifies = await tx.update(entreprise).set({ gereStock: activer }).where(eq(entreprise.id, entrepriseId)).returning({ id: entreprise.id });
  return modifies.length === 0 ? { ok: false, erreur: m("Entreprise introuvable.") } : { ok: true, active: activer };
}

/** Vrai quand l'entreprise gère le stock ET interdit la vente en rupture. */
export async function blocageRuptureActif(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  const [e] = await tx.select({ gereStock: entreprise.gereStock, bloquer: entreprise.bloquerVenteRupture }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return e?.gereStock === true && e.bloquer === true;
}

/** Active ou désactive l'interdiction de vendre en rupture (réservé aux entreprises de produits). */
export async function modifierBlocageRupture(tx: TransactionDrizzle, entrepriseId: string, bloquer: boolean): Promise<{ ok: true; bloquer: boolean } | { ok: false; erreur: string }> {
  if (!(await gestionStockActive(tx, entrepriseId))) return { ok: false, erreur: MESSAGE_STOCK_DESACTIVE };
  await tx.update(entreprise).set({ bloquerVenteRupture: bloquer }).where(eq(entreprise.id, entrepriseId));
  return { ok: true, bloquer };
}
