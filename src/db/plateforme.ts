import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Connexion dédiée au rôle Postgres plateforme_lecture (BYPASSRLS, SELECT
 * uniquement — aucun droit d'écriture accordé en base, voir
 * docs/mise-en-production-checklist.md pour le SQL de création exact).
 * Réservée aux lectures agrégées/cross-tenant de la Console interne
 * (src/app/plateforme/*).
 *
 * Jamais de .insert()/.update()/.delete() via ce client — la restriction
 * réelle vient des droits SQL du rôle (un bug ici échouerait avec
 * "permission denied", jamais silencieusement), pas d'une simple convention
 * de code. Toute écriture sur une entreprise précise passe par
 * avecEntreprise() (src/db/client.ts), exactement comme partout ailleurs
 * dans le produit.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL_PLATEFORME });

export const dbPlateforme = drizzle(pool, { schema });
