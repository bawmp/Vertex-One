import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab) — docs/palier-4-*, section 3.
 * Même principe que verifier-relances.ts (Palier 1) : distribue un job par
 * entreprise plutôt que de tout traiter ici, pour isoler les échecs.
 */
const verifierEcheancesContrats: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);

  for (const e of entreprises) {
    await helpers.addJob("verifier-echeances-contrats-entreprise", { entrepriseId: e.id });
  }

  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour vérification des échéances de contrats`);
};

export default verifierEcheancesContrats;
