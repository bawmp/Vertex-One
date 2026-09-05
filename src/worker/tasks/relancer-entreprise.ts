import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";

type ChargeRelance = { entrepriseId: string };

/**
 * Traite une seule entreprise — voir verifier-relances.ts pour le
 * déclenchement quotidien qui distribue un job par entreprise. Isolé par
 * entreprise plutôt qu'une seule tâche géante : un échec (email qui plante,
 * entreprise avec des données incohérentes) n'affecte que cette entreprise,
 * et graphile-worker retente automatiquement cette seule tâche.
 *
 * Passe par avecEntreprise() (rôle Postgres restreint, RLS active) comme
 * n'importe quel code applicatif — la tâche planifiée elle-même tourne avec
 * un rôle élevé pour sa propre file d'attente (voir run.ts), mais jamais
 * pour manipuler les données métier d'une entreprise. Voir CLAUDE.md.
 */
const relancerEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeRelance;

  const resultats = await avecEntreprise(entrepriseId, (tx) => marquerFacturesEnRetard(tx, entrepriseId));

  if (resultats.length > 0) {
    helpers.logger.info(`${resultats.length} relance(s) traitée(s) pour l'entreprise ${entrepriseId}`, { resultats });
  }
};

export default relancerEntreprise;
