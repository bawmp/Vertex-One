import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab à la racine) — docs/palier-1-*,
 * section 6, étape 6. Ne traite aucune facture elle-même : elle distribue un
 * job "relancer-entreprise" par entreprise, pour que l'échec d'une seule
 * entreprise (email qui plante, etc.) ne bloque jamais les autres et
 * bénéficie du retry automatique de graphile-worker indépendamment.
 */
const verifierRelances: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);

  for (const e of entreprises) {
    await helpers.addJob("relancer-entreprise", { entrepriseId: e.id });
  }

  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour vérification des relances`);
};

export default verifierRelances;
