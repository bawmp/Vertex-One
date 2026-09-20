import type { Task } from "graphile-worker";
import { avecEntreprise } from "@/db/client";
import { notifierMessagesDirects } from "@/lib/messagerie/notifications";

type ChargeNotifierMessages = { entrepriseId: string };

/**
 * Traite une seule entreprise — voir verifier-messages-a-notifier.ts. Passe par avecEntreprise() (rôle restreint,
 * RLS active) comme tout code applicatif : jamais les données d'une autre entreprise. Voir CLAUDE.md.
 */
const notifierMessagesEntreprise: Task = async (payload, helpers) => {
  const { entrepriseId } = payload as ChargeNotifierMessages;
  const { emailsEnvoyes } = await avecEntreprise(entrepriseId, (tx) => notifierMessagesDirects(tx, entrepriseId));
  if (emailsEnvoyes > 0) helpers.logger.info(`${emailsEnvoyes} email(s) de message direct envoyé(s) pour l'entreprise ${entrepriseId}`);
};

export default notifierMessagesEntreprise;
