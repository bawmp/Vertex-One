import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { traiterRappelsAnniversaires } from "@/lib/rh/anniversaires";

type ChargeAnniversaires = { entrepriseId: string };

/** Le jour civil d'aujourd'hui à Douala (AAAA-MM-JJ). */
const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());

/**
 * Traite une seule entreprise — voir verifier-anniversaires.ts. Passe par avecEntreprise() (rôle restreint, RLS active) comme tout code
 * applicatif : jamais les données d'une autre entreprise. Voir CLAUDE.md.
 */
const anniversairesEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeAnniversaires;
  const r = await avecEntreprise(entrepriseId, (tx) => traiterRappelsAnniversaires(tx, entrepriseId, aujourdhuiDouala()));
  if (r.anniversaires > 0) helpers.logger.info(`Anniversaires du jour pour l'entreprise ${entrepriseId} : ${r.anniversaires}, ${r.destinataires} destinataire(s)`);
};

export default anniversairesEntreprise;
