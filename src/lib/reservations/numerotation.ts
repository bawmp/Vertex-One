import { sql, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Même mécanisme atomique éprouvé que src/lib/facturation/numerotation.ts
 * (UPDATE ... RETURNING, sérialisé par le verrou de ligne Postgres) — fichier
 * séparé pour garder Booking indépendant de Facturation (voir CLAUDE.md,
 * "Indépendance des modules").
 */
export async function genererNumeroReservation(tx: TransactionDrizzle, entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const [ligne] = await tx
    .update(entreprise)
    .set({ compteurReservations: sql`${entreprise.compteurReservations} + 1` })
    .where(eq(entreprise.id, entrepriseId))
    .returning({ compteur: entreprise.compteurReservations });

  return `RDV-${annee}-${String(ligne.compteur).padStart(6, "0")}`;
}
