import type { Task } from "graphile-worker";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab) : distribue un job « alertes-stock-entreprise » par entreprise qui gère un stock, pour que
 * l'échec de l'une ne bloque jamais les autres.
 */
const verifierAlertesStock: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.gereStock, true));
  for (const e of entreprises) await helpers.addJob("alertes-stock-entreprise", { entrepriseId: e.id });
  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour les alertes de stock`);
};

export default verifierAlertesStock;
