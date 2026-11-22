import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { alerterParEmail } from "@/lib/notifications/equipe";
import { renouvelerMissions } from "@/lib/rh/missions";

type ChargeMissions = { entrepriseId: string };

/** Le jour civil d'aujourd'hui à Douala (AAAA-MM-JJ). */
const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());

/**
 * Renouvelle les missions de la semaine et du mois dont la période est finie, pour UNE entreprise — voir verifier-missions.ts. Passe par
 * avecEntreprise() (rôle restreint, RLS active) comme tout code applicatif. Les emails (un par personne) partent APRÈS la transaction : un échec
 * d'envoi n'annule jamais un renouvellement.
 */
const renouvelerMissionsEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeMissions;
  const r = await avecEntreprise(entrepriseId, (tx) => renouvelerMissions(tx, entrepriseId, aujourdhuiDouala()));
  for (const c of r.courriers) await alerterParEmail([c.to], c.sujet, c.html);
  if (r.renouvelees > 0) helpers.logger.info(`Missions renouvelées pour l'entreprise ${entrepriseId} : ${r.renouvelees}, ${r.courriers.length} email(s)`);
};

export default renouvelerMissionsEntreprise;
