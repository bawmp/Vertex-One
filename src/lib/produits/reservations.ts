import { and, desc, eq, inArray, isNotNull, ne, or, isNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { bonCommandeVente, ligneBonCommandeVente } from "@/db/schema";
import { assurerDepotPrincipal } from "./depots";

/**
 * Réservation de stock (priorité 3.7). Une commande client en cours (statut « brouillon », pas encore facturée ni annulée) réserve les
 * quantités de ses lignes : elles restent en stock mais ne sont plus « disponibles » pour une autre vente. Aucune table de plus : la
 * réservation EST la commande, donc elle se libère toute seule quand la commande est facturée (le stock sort alors) ou annulée.
 */

/** Stock disponible à la vente : ce qui est en stock moins ce qui est réservé (peut être négatif si la rupture a déjà été vendue). */
export function stockDisponible(stock: number, reserve: number): number {
  return stock - Math.max(reserve, 0);
}

type Options = {
  /** Ne compte que les commandes de ce dépôt (celles sans dépôt visent le dépôt principal). Absent : tous les dépôts. */
  depotId?: string | null;
  /** Commande à ignorer : celle qu'on est en train de facturer ne se réserve pas à elle-même. */
  exclureCommandeId?: string;
  produitIds?: string[];
};

/** Quantités réservées par produit par les commandes client en cours de l'entreprise. */
export async function reservesParProduit(tx: TransactionDrizzle, entrepriseId: string, options: Options = {}): Promise<Map<string, number>> {
  const conditions = [eq(bonCommandeVente.entrepriseId, entrepriseId), eq(bonCommandeVente.statut, "BROUILLON"), isNotNull(ligneBonCommandeVente.produitId)];
  if (options.exclureCommandeId) conditions.push(ne(bonCommandeVente.id, options.exclureCommandeId));
  if (options.produitIds) {
    if (options.produitIds.length === 0) return new Map();
    conditions.push(inArray(ligneBonCommandeVente.produitId, options.produitIds));
  }
  if (options.depotId) {
    const principal = await assurerDepotPrincipal(tx, entrepriseId);
    conditions.push(options.depotId === principal.id ? or(eq(bonCommandeVente.depotId, options.depotId), isNull(bonCommandeVente.depotId))! : eq(bonCommandeVente.depotId, options.depotId));
  }
  const lignes = await tx
    .select({ produitId: ligneBonCommandeVente.produitId, quantite: sql<number>`coalesce(sum(${ligneBonCommandeVente.quantite}), 0)::float` })
    .from(ligneBonCommandeVente)
    .innerJoin(bonCommandeVente, eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVente.id))
    .where(and(...conditions))
    .groupBy(ligneBonCommandeVente.produitId);
  return new Map(lignes.map((l) => [l.produitId as string, l.quantite]));
}

export type CommandeReservante = { id: string; numero: string; quantite: number; dateCommande: Date };

/** Les commandes client en cours qui réservent ce produit, la plus récente d'abord. */
export async function commandesQuiReservent(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<CommandeReservante[]> {
  const lignes = await tx
    .select({ id: bonCommandeVente.id, numero: bonCommandeVente.numero, quantite: sql<number>`sum(${ligneBonCommandeVente.quantite})::float`, dateCommande: bonCommandeVente.dateCommande })
    .from(ligneBonCommandeVente)
    .innerJoin(bonCommandeVente, eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVente.id))
    .where(and(eq(bonCommandeVente.entrepriseId, entrepriseId), eq(bonCommandeVente.statut, "BROUILLON"), eq(ligneBonCommandeVente.produitId, produitId)))
    .groupBy(bonCommandeVente.id, bonCommandeVente.numero, bonCommandeVente.dateCommande)
    .orderBy(desc(bonCommandeVente.dateCommande));
  return lignes;
}
