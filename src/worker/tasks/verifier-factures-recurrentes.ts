import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab à la racine), même patron que
 * verifier-relances.ts — distribue un job "facturer-recurrente-entreprise"
 * par entreprise plutôt que de générer les factures elle-même, pour isoler
 * l'échec d'une entreprise (NIU manquant, données incohérentes) du
 * traitement des autres.
 */
const verifierFacturesRecurrentes: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);

  for (const e of entreprises) {
    await helpers.addJob("facturer-recurrente-entreprise", { entrepriseId: e.id });
  }

  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour vérification des factures récurrentes`);
};

export default verifierFacturesRecurrentes;
