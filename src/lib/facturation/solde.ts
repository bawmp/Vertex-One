import { eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { avoirClient, paiement } from "@/db/schema";
import { calculerSolde, type Solde } from "./tranche";

export * from "./tranche";

/** Total des avoirs clients (partiels) émis sur une facture. Une facture « annulée en entier » n'en compte pas : elle a son propre statut. */
export async function totalAvoirsFacture(tx: TransactionDrizzle, factureId: string): Promise<number> {
  const [ligne] = await tx.select({ total: sql<number>`coalesce(sum(${avoirClient.montantTTC}), 0)::int` }).from(avoirClient).where(eq(avoirClient.factureId, factureId));
  return ligne?.total ?? 0;
}

/** Ce que le client doit réellement payer : le montant de la facture moins ses avoirs partiels, jamais moins que zéro. */
export async function montantNetFacture(tx: TransactionDrizzle, factureId: string, montantTTC: number): Promise<number> {
  return Math.max(0, montantTTC - (await totalAvoirsFacture(tx, factureId)));
}

/**
 * Solde d'une facture, lu depuis ses règlements enregistrés (RLS de la transaction). Les règles pures sont dans tranche.ts. Depuis les
 * avoirs partiels (2026-11-02), le solde se mesure sur le montant NET (facture moins avoirs) : la fiche de la facture ne change jamais,
 * ce qui reste dû, si.
 */
export async function lireSolde(tx: TransactionDrizzle, factureId: string, montantTTC: number): Promise<Solde> {
  const reglements = await tx.select({ montant: paiement.montant }).from(paiement).where(eq(paiement.factureId, factureId));
  return calculerSolde(await montantNetFacture(tx, factureId, montantTTC), reglements);
}
