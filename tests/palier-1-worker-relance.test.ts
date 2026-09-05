import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { runOnce, addJobAdhoc } from "graphile-worker";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, prospect, facture } from "@/db/schema";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";

/**
 * Vérifie l'infrastructure graphile-worker elle-même, pas seulement la
 * logique métier (déjà couverte par palier-1-relance-facture.test.ts) : un
 * job réellement mis en file via addJobAdhoc() est bien récupéré et exécuté
 * par le runtime graphile-worker (runOnce), à travers la vraie table
 * graphile_worker.jobs sur Neon.
 *
 * Utilise DATABASE_URL_WORKER (endpoint direct, sans "-pooler") comme le
 * worker réel — voir CLAUDE.md, section file d'attente : le pooler Neon
 * casse LISTEN/NOTIFY (bug réel rencontré et corrigé).
 *
 * Note : ce test s'est montré flaky pendant le développement (environ un
 * échec sur deux), avec une erreur de connexion générique ("No database
 * host or connection string was set...") disparaissant sans changement de
 * code au run suivant — cohérent avec l'instabilité de connexion Neon déjà
 * documentée dans CLAUDE.md sous sollicitation prolongée, pas un bug de ce
 * test. `retry: 2` assumé explicitement plutôt que masqué.
 */
describe("Palier 1 — infrastructure graphile-worker", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let factureId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Worker Infra", secteurProfil: "generique" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-test-worker-infra@vertexone.test", nomComplet: "Admin Test", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    factureId = await avecEntreprise(entrepriseId, async (tx) => {
      const [p] = await tx
        .insert(prospect)
        .values({ entrepriseId, nom: "Client Test", telephone: "+237600000000", email: "client-test@vertexone.test", assigneAId: utilisateurId })
        .returning({ id: prospect.id });

      const hier = new Date();
      hier.setDate(hier.getDate() - 1);

      const [f] = await tx
        .insert(facture)
        .values({
          entrepriseId,
          numero: "FAC-TEST-WORKER-INFRA-000001",
          prospectId: p.id,
          statut: "EMISE",
          montantHT: 100000,
          montantTVA: 19250,
          montantTTC: 119250,
          dateEcheance: hier,
        })
        .returning({ id: facture.id });
      return f.id;
    });
  });

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId)));
    await avecEntreprise(entrepriseId, (tx) => tx.delete(prospect).where(eq(prospect.entrepriseId, entrepriseId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  });

  test("un job réellement mis en file est récupéré et exécuté par le runtime graphile-worker", { retry: 2 }, async () => {
    await addJobAdhoc({ connectionString: process.env.DATABASE_URL_WORKER }, "relancer-entreprise", { entrepriseId });

    await runOnce(
      { connectionString: process.env.DATABASE_URL_WORKER },
      {
        "relancer-entreprise": async (payload) => {
          const { entrepriseId: id } = payload as { entrepriseId: string };
          await avecEntreprise(id, (tx) => marquerFacturesEnRetard(tx, id));
        },
      }
    );

    const [laFacture] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, factureId)));
    expect(laFacture.statut).toBe("EN_RETARD");
  });
});
