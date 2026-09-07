import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { genererFacturesRecurrentesDues } from "@/lib/facturation/recurrence";

type ChargeFacturationRecurrente = { entrepriseId: string };

/**
 * Traite une seule entreprise — voir verifier-factures-recurrentes.ts pour
 * le déclenchement quotidien. Passe par avecEntreprise() (rôle Postgres
 * restreint, RLS active) comme tout code applicatif — voir CLAUDE.md.
 */
const facturerRecurrenteEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeFacturationRecurrente;

  const resultats = await avecEntreprise(entrepriseId, (tx) => genererFacturesRecurrentesDues(tx, entrepriseId));

  if (resultats.length > 0) {
    helpers.logger.info(`${resultats.length} facture(s) récurrente(s) traitée(s) pour l'entreprise ${entrepriseId}`, { resultats });
  }
};

export default facturerRecurrenteEntreprise;
