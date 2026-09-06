import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { verifierProspectsInactifs, verifierClientsEnSommeil } from "@/lib/marketing/automatisations";

type ChargeVerification = { entrepriseId: string };

const verifierAutomatisationsMarketingEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeVerification;

  const [inactifs, enSommeil] = await avecEntreprise(entrepriseId, async (tx) => [
    await verifierProspectsInactifs(tx, entrepriseId),
    await verifierClientsEnSommeil(tx, entrepriseId),
  ]);

  const total = inactifs.length + enSommeil.length;
  if (total > 0) {
    helpers.logger.info(`${total} relance(s) marketing traitée(s) pour l'entreprise ${entrepriseId}`, { inactifs, enSommeil });
  }
};

export default verifierAutomatisationsMarketingEntreprise;
