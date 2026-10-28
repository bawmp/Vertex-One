import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";
import { traiterPromessesEchues } from "@/lib/facturation/promesse";

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

  // Les promesses de paiement échues d'abord (tenues, ou non tenues avec alerte), puis les relances : une promesse non tenue
  // libère aussitôt la relance de sa facture.
  const promesses = await avecEntreprise(entrepriseId, (tx) => traiterPromessesEchues(tx, entrepriseId));
  if (promesses.tenues + promesses.nonTenues > 0) {
    helpers.logger.info(`Promesses de paiement de l'entreprise ${entrepriseId} : ${promesses.tenues} tenue(s), ${promesses.nonTenues} non tenue(s)`, { promesses });
  }

  const resultats = await avecEntreprise(entrepriseId, (tx) => marquerFacturesEnRetard(tx, entrepriseId));

  if (resultats.length > 0) {
    helpers.logger.info(`${resultats.length} relance(s) traitée(s) pour l'entreprise ${entrepriseId}`, { resultats });
  }
};

export default relancerEntreprise;
