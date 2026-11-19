import type { Task } from "graphile-worker";
import { executerSequenceEntreprise } from "@/lib/crm/sequence-prospects-executer";

type ChargeSequence = { entrepriseId: string };

/**
 * Traite UNE entreprise — voir verifier-sequences-prospects.ts. L'exécuteur passe par avecEntreprise() (rôle restreint, RLS active) : jamais les données
 * d'une autre entreprise. Garde-fous (désactivé par défaut, plafond quotidien, réservation avant envoi) dans src/lib/crm/sequence-prospects-executer.ts.
 */
const sequenceProspectsEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeSequence;
  const r = await executerSequenceEntreprise(entrepriseId);
  if (r.envoyes > 0 || r.echecs > 0 || r.reportes > 0) {
    helpers.logger.info(`Relance automatique des prospects, entreprise ${entrepriseId} : ${r.envoyes} envoyé(s), ${r.echecs} échec(s), ${r.reportes} reporté(s) à demain`);
  }
};

export default sequenceProspectsEntreprise;
