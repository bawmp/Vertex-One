import type { Task } from "graphile-worker";
import { and, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { DELAI_NOTIFICATION_MINUTES } from "@/lib/messagerie/notifications";

/**
 * Toutes les 3 minutes (voir crontab). Ne notifie rien elle-même : elle distribue un job par entreprise qui a
 * des messages directs en attente (colonne posée à l'envoi d'un message direct), pour ne jamais balayer toutes les
 * entreprises à chaque passage et pour que l'échec d'une entreprise n'affecte pas les autres.
 */
const verifierMessagesANotifier: Task = async (_payload, helpers) => {
  const entreprises = await db
    .select({ id: entreprise.id })
    .from(entreprise)
    .where(and(isNotNull(entreprise.messagesANotifierDepuis), sql`${entreprise.messagesANotifierDepuis} < now() - make_interval(mins => ${DELAI_NOTIFICATION_MINUTES})`));

  for (const e of entreprises) {
    // jobKey : un seul job en attente par entreprise, même si le passage suivant arrive avant la fin du précédent.
    await helpers.addJob("notifier-messages-entreprise", { entrepriseId: e.id }, { jobKey: `notifier-messages-${e.id}` });
  }

  if (entreprises.length > 0) helpers.logger.info(`${entreprises.length} entreprise(s) avec des messages directs à notifier`);
};

export default verifierMessagesANotifier;
