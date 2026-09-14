import type { Task } from "graphile-worker";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Tâche planifiée quotidienne (voir crontab à la racine) — échange du
 * 2026-09-14, abonnement plat 50 000 FCFA/mois. Ne traite aucune entreprise
 * elle-même : distribue un job "traiter-abonnement-entreprise" par
 * entreprise, même patron que verifier-relances.ts (l'échec d'une seule
 * entreprise n'affecte jamais les autres, retry automatique indépendant).
 */
const verifierAbonnements: Task = async (_payload, helpers) => {
  const entreprises = await db.select({ id: entreprise.id }).from(entreprise);

  for (const e of entreprises) {
    await helpers.addJob("traiter-abonnement-entreprise", { entrepriseId: e.id });
  }

  helpers.logger.info(`${entreprises.length} entreprise(s) programmée(s) pour vérification de l'abonnement`);
};

export default verifierAbonnements;
