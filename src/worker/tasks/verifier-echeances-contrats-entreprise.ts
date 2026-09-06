import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { verifierEcheancesContrats } from "@/lib/contrats/echeances";

type ChargeVerification = { entrepriseId: string };

/**
 * Traite une seule entreprise — voir verifier-echeances-contrats.ts pour le
 * déclenchement quotidien. Passe par avecEntreprise() comme tout code
 * applicatif (voir CLAUDE.md, section file d'attente).
 */
const verifierEcheancesContratsEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeVerification;

  const resultats = await avecEntreprise(entrepriseId, (tx) => verifierEcheancesContrats(tx, entrepriseId));

  if (resultats.length > 0) {
    helpers.logger.info(`${resultats.length} alerte(s) d'échéance de contrat traitée(s) pour l'entreprise ${entrepriseId}`, { resultats });
  }
};

export default verifierEcheancesContratsEntreprise;
