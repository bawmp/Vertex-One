import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { paiement } from "@/db/schema";
import { calculerSolde, type Solde } from "./tranche";

export * from "./tranche";

/** Solde d'une facture, lu depuis ses règlements enregistrés (RLS de la transaction). Les règles pures sont dans tranche.ts. */
export async function lireSolde(tx: TransactionDrizzle, factureId: string, montantTTC: number): Promise<Solde> {
  const reglements = await tx.select({ montant: paiement.montant }).from(paiement).where(eq(paiement.factureId, factureId));
  return calculerSolde(montantTTC, reglements);
}
