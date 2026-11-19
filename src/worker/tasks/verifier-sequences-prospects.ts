import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Tâche planifiée (voir crontab, du lundi au samedi) : distribue un job « sequence-prospects-entreprise » par entreprise qui a ACTIVÉ la relance automatique
 * des prospects (réglage désactivé par défaut), pour que l'échec de l'une ne bloque jamais les autres.
 */
const verifierSequencesProspects: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise).where(eq(entreprise.sequenceProspectsActive, true));
  for (const e of entreprises) await helpers.addJob("sequence-prospects-entreprise", { entrepriseId: e.id });
  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour la relance automatique des prospects`);
};

export default verifierSequencesProspects;
