import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Processus persistant (pas une fonction serverless) — voir CLAUDE.md,
 * section file d'attente. Lancé via `npm run worker`.
 *
 * Imports dynamiques, pas statiques : un `import` statique est hissé par
 * ESM et s'évalue avant le `config()` ci-dessus, donc avant que
 * DATABASE_URL n'existe — src/db/client.ts construit son Pool à l'import et
 * capturerait une chaîne de connexion vide. Un `import()` dynamique dans
 * main() s'exécute dans l'ordre normal, après config(). Bug réel rencontré
 * en testant : le worker démarrait sans erreur visible (sa propre connexion
 * graphile-worker, lue à l'appel de run(), fonctionnait), mais toute tâche
 * utilisant avecEntreprise() aurait échoué silencieusement.
 *
 * Connexion graphile-worker elle-même avec le rôle owner sur l'endpoint
 * DIRECT (DATABASE_URL_WORKER, sans "-pooler"), pas le rôle applicatif
 * restreint et pas le pooler : il lui faut les droits DDL pour son propre
 * schéma "graphile_worker" (aucune donnée métier multi-tenant, pas de
 * politique RLS à respecter ici), et une connexion non poolée pour que
 * LISTEN/NOTIFY fonctionne réellement — le pooler Neon (PgBouncer, mode
 * transaction) recycle les connexions entre requêtes et casse LISTEN,
 * provoquant des "Connection terminated unexpectedly" en boucle (rencontré
 * en testant). Le code des tâches, lui, repasse par avecEntreprise() (rôle
 * restreint, via le pooler comme le reste de l'app) dès qu'il touche aux
 * données d'une entreprise — voir tasks/relancer-entreprise.ts.
 */
async function main() {
  const { run } = await import("graphile-worker");
  const { default: verifierRelances } = await import("./tasks/verifier-relances");
  const { default: relancerEntreprise } = await import("./tasks/relancer-entreprise");
  const { default: verifierEcheancesContrats } = await import("./tasks/verifier-echeances-contrats");
  const { default: verifierEcheancesContratsEntreprise } = await import("./tasks/verifier-echeances-contrats-entreprise");
  const { default: verifierAutomatisationsMarketing } = await import("./tasks/verifier-automatisations-marketing");
  const { default: verifierAutomatisationsMarketingEntreprise } = await import("./tasks/verifier-automatisations-marketing-entreprise");
  const { default: verifierFacturesRecurrentes } = await import("./tasks/verifier-factures-recurrentes");
  const { default: facturerRecurrenteEntreprise } = await import("./tasks/facturer-recurrente-entreprise");

  const runner = await run({
    connectionString: process.env.DATABASE_URL_WORKER,
    concurrency: 5,
    crontabFile: "crontab",
    taskList: {
      "verifier-relances": verifierRelances,
      "relancer-entreprise": relancerEntreprise,
      "verifier-echeances-contrats": verifierEcheancesContrats,
      "verifier-echeances-contrats-entreprise": verifierEcheancesContratsEntreprise,
      "verifier-automatisations-marketing": verifierAutomatisationsMarketing,
      "verifier-automatisations-marketing-entreprise": verifierAutomatisationsMarketingEntreprise,
      "verifier-factures-recurrentes": verifierFacturesRecurrentes,
      "facturer-recurrente-entreprise": facturerRecurrenteEntreprise,
    },
  });

  console.log("Worker Vertex One démarré — en attente de tâches (Ctrl+C pour arrêter).");
  await runner.promise;
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
