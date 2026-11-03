import { and, desc, eq, inArray, isNotNull, ne, or, isNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { bonCommandeVente, composantKit, ligneBonCommandeVente } from "@/db/schema";
import { assurerDepotPrincipal } from "./depots";
import { compositionsDe } from "./kits-etendre";

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
    // Un composant est aussi réservé par les kits qui le contiennent : on lit donc aussi les lignes de ces kits.
    const kits = await tx.select({ kitId: composantKit.kitId }).from(composantKit).where(and(eq(composantKit.entrepriseId, entrepriseId), inArray(composantKit.composantId, options.produitIds)));
    conditions.push(inArray(ligneBonCommandeVente.produitId, [...options.produitIds, ...kits.map((k) => k.kitId)]));
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
  return appliquerKits(tx, entrepriseId, new Map(lignes.map((l) => [l.produitId as string, l.quantite])), options.produitIds);
}

/** Remplace, dans une table de quantités réservées, chaque kit par ses composants (quantité du kit × quantité du composant). */
async function appliquerKits(tx: TransactionDrizzle, entrepriseId: string, reserves: Map<string, number>, limiteA?: string[]): Promise<Map<string, number>> {
  const compositions = await compositionsDe(tx, entrepriseId, [...reserves.keys()]);
  if (compositions.size === 0) return reserves;
  const resultat = new Map<string, number>();
  for (const [produitId, quantite] of reserves) {
    const composants = compositions.get(produitId);
    if (!composants) {
      resultat.set(produitId, (resultat.get(produitId) ?? 0) + quantite);
      continue;
    }
    for (const c of composants) resultat.set(c.composantId, (resultat.get(c.composantId) ?? 0) + quantite * c.quantite);
  }
  if (limiteA) for (const id of [...resultat.keys()]) if (!limiteA.includes(id)) resultat.delete(id);
  return resultat;
}

export type CommandeReservante = { id: string; numero: string; quantite: number; dateCommande: Date };

/** Les commandes client en cours qui réservent ce produit (directement, ou par un kit qui le contient), la plus récente d'abord. */
export async function commandesQuiReservent(tx: TransactionDrizzle, entrepriseId: string, produitId: string): Promise<CommandeReservante[]> {
  const kits = await tx.select({ kitId: composantKit.kitId, quantite: composantKit.quantite }).from(composantKit).where(and(eq(composantKit.entrepriseId, entrepriseId), eq(composantKit.composantId, produitId)));
  const multiplicateur = new Map<string, number>([[produitId, 1], ...kits.map((k) => [k.kitId, k.quantite] as [string, number])]);
  const lignes = await tx
    .select({ id: bonCommandeVente.id, numero: bonCommandeVente.numero, produitId: ligneBonCommandeVente.produitId, quantite: sql<number>`sum(${ligneBonCommandeVente.quantite})::float`, dateCommande: bonCommandeVente.dateCommande })
    .from(ligneBonCommandeVente)
    .innerJoin(bonCommandeVente, eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVente.id))
    .where(and(eq(bonCommandeVente.entrepriseId, entrepriseId), eq(bonCommandeVente.statut, "BROUILLON"), inArray(ligneBonCommandeVente.produitId, [...multiplicateur.keys()])))
    .groupBy(bonCommandeVente.id, bonCommandeVente.numero, bonCommandeVente.dateCommande, ligneBonCommandeVente.produitId)
    .orderBy(desc(bonCommandeVente.dateCommande));
  const parCommande = new Map<string, CommandeReservante>();
  for (const l of lignes) {
    const quantite = l.quantite * (multiplicateur.get(l.produitId as string) ?? 1);
    const existante = parCommande.get(l.id);
    if (existante) existante.quantite += quantite;
    else parCommande.set(l.id, { id: l.id, numero: l.numero, quantite, dateCommande: l.dateCommande });
  }
  return [...parCommande.values()];
}
