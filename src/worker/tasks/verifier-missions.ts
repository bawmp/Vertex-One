import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab) : distribue un job « renouveler-missions-entreprise » par entreprise, pour que l'échec de l'une
 * ne bloque jamais les autres.
 */
const verifierMissions: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);
  for (const e of entreprises) await helpers.addJob("renouveler-missions-entreprise", { entrepriseId: e.id });
  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour le renouvellement des missions`);
};

export default verifierMissions;
