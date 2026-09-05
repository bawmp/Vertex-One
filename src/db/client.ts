import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Driver neon-serverless (pool WebSocket) — jamais neon-http, qui ne supporte
// pas db.transaction() et casserait le pattern RLS ci-dessous. Voir CLAUDE.md.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

// Type de la transaction Drizzle ouverte par avecEntreprise() — exporté pour
// que les fonctions appelées à l'intérieur (ex: genererNumeroFacture) soient
// typées correctement sans dépendre d'un chemin d'import propre au driver.
export type TransactionDrizzle = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Toute requête vers une table métier protégée par Row-Level Security doit
 * passer par ce helper : set_config() et la requête s'exécutent dans la même
 * transaction, garantissant que la politique RLS voit le bon entrepriseId
 * même avec des connexions poolées. Voir docs/palier-0-*, section 6.
 *
 * set_config(), pas "SET LOCAL app.entreprise_id = $1" : SET n'accepte pas
 * de paramètre lié côté protocole préparé Postgres ("syntax error at or near
 * $1") — set_config() est un appel de fonction normal, qui accepte un
 * paramètre. Le troisième argument (true) borne l'effet à la transaction en
 * cours, l'équivalent de LOCAL. Confirmé par exécution réelle contre Neon,
 * pas seulement par lecture de la documentation Postgres.
 *
 * Ne pas utiliser pour les tables consultées par Better-Auth (utilisateur,
 * session, compte) avant qu'une session ne soit établie — voir CLAUDE.md.
 */
export async function avecEntreprise<T>(
  entrepriseId: string,
  fn: (tx: TransactionDrizzle) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.entreprise_id', ${entrepriseId}, true)`);
    return fn(tx);
  });
}
