import type { Task } from "graphile-worker";

/**
 * Toutes les minutes (voir crontab) — appelle la route interne de réconciliation plutôt que de relire
 * directement les paiements ici : @/lib/paiement/confirmation importe "server-only" (protection contre une fuite
 * de app_key Aangaraa Pay dans un bundle client), qui échoue hors du contexte de build Next.js — donc hors d'une
 * exécution tsx/node comme ce worker. Voir src/app/api/interne/reconcilier-abonnements/route.ts pour la vraie
 * logique (réutilise relireEtConfirmerAbonnement(), aucune règle métier dupliquée ici).
 */
const reconcilierAbonnements: Task = async (_payload, helpers) => {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!secret) {
    helpers.logger.error("WORKER_INTERNAL_SECRET absent — réconciliation des abonnements ignorée");
    return;
  }

  const reponse = await fetch(`${base}/api/interne/reconcilier-abonnements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  if (!reponse.ok) {
    helpers.logger.error(`Réconciliation des abonnements : HTTP ${reponse.status}`);
    return;
  }

  const resultat = (await reponse.json()) as { examinees: number; confirmees: number };
  if (resultat.examinees > 0) helpers.logger.info(`Abonnements réconciliés : ${resultat.confirmees}/${resultat.examinees} confirmé(s)`);
};

export default reconcilierAbonnements;
