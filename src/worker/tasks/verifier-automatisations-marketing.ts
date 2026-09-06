import type { Task } from "graphile-worker";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise, addonActif } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab) — docs/palier-6-*, section 2.
 * Ne distribue un job que pour les entreprises ayant réellement activé
 * l'addon MARKETING (docs/palier-6-*, section 5) : pas la peine de mettre en
 * file d'attente une vérification pour une entreprise qui n'a pas ce module.
 */
const verifierAutomatisationsMarketing: Task = async (_payload, helpers) => {
  const entreprises = await db
    .select({ id: entreprise.id })
    .from(entreprise)
    .innerJoin(addonActif, eq(addonActif.entrepriseId, entreprise.id))
    .where(eq(addonActif.addon, "MARKETING"));

  for (const e of entreprises) {
    await helpers.addJob("verifier-automatisations-marketing-entreprise", { entrepriseId: e.id });
  }

  helpers.logger.info(`${entreprises.length} entreprise(s) avec l'addon Marketing programmée(s) pour vérification`);
};

export default verifierAutomatisationsMarketing;
