import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Driver neon-serverless (pool WebSocket) — jamais neon-http, qui ne supporte
// pas db.transaction() et casserait le pattern RLS ci-dessous. Voir CLAUDE.md.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

/**
 * Toute requête vers une table métier protégée par Row-Level Security doit
 * passer par ce helper : SET LOCAL et la requête s'exécutent dans la même
 * transaction, garantissant que la politique RLS voit le bon entrepriseId
 * même avec des connexions poolées. Voir docs/palier-0-*, section 6.
 *
 * Ne pas utiliser pour les tables consultées par Better-Auth (utilisateur,
 * session, compte) avant qu'une session ne soit établie — voir CLAUDE.md.
 */
export async function avecEntreprise<T>(
  entrepriseId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.entreprise_id = ${entrepriseId}`);
    return fn(tx);
  });
}
