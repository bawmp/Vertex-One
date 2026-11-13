import type { Task } from "graphile-worker";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée (toutes les 5 minutes, voir crontab) : distribue un job « synchroniser-boutiques-entreprise » par entreprise qui a au
 * moins une boutique en ligne connectée automatiquement — jamais un balayage complet. Le `jobKey` évite d'empiler deux jobs pour la même
 * entreprise si un tour est encore en cours (un nouveau tour remplace celui qui attend).
 */
const verifierBoutiques: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.synchroBoutiqueActive, true));
  for (const e of entreprises) await helpers.addJob("synchroniser-boutiques-entreprise", { entrepriseId: e.id }, { jobKey: `boutiques-${e.id}`, maxAttempts: 1 });
  if (entreprises.length > 0) helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour la synchronisation des boutiques`);
};

export default verifierBoutiques;
