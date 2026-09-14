import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, journalActionPlateforme } from "@/db/schema";

/**
 * Console interne plateforme (2026-09-14) — test de fuite délibérée entre
 * deux entreprises fictives, voir CLAUDE.md. Même structure que
 * tests/tentative-paiement-abonnement-fuite-rls.test.ts — RLS strictement
 * standard, aucune lecture anonyme (la Console interne lit cette table via
 * dbPlateforme, un rôle Postgres séparé qui bypass la RLS par octroi
 * explicite, jamais via cette policy).
 */
describe("Journal d'action plateforme — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let journalMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Journal Plateforme Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Journal Plateforme Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-jp-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-jp-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbarga.id;

    journalMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [ligne] = await tx
        .insert(journalActionPlateforme)
        .values({ entrepriseId: mbargaId, staffEmail: "staff@vertexone.cm", action: "SUSPENDU_MANUELLEMENT" })
        .returning({ id: journalActionPlateforme.id });
      return ligne.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, (tx) => tx.delete(journalActionPlateforme).where(eq(journalActionPlateforme.entrepriseId, mbargaId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais le journal d'une autre", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(journalActionPlateforme).where(eq(journalActionPlateforme.id, journalMbargaId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("aucune lecture anonyme (contrairement à invitation) — une requête sans session ne renvoie rien", async () => {
    const sansSession = await db.select().from(journalActionPlateforme).where(eq(journalActionPlateforme.id, journalMbargaId));
    expect(sansSession).toHaveLength(0);
  });

  test("l'entreprise propriétaire voit bien sa propre ligne de journal", async () => {
    const depuisMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(journalActionPlateforme).where(eq(journalActionPlateforme.id, journalMbargaId)));
    expect(depuisMbarga).toHaveLength(1);
    expect(depuisMbarga[0].action).toBe("SUSPENDU_MANUELLEMENT");
    expect(depuisMbarga[0].staffEmail).toBe("staff@vertexone.cm");
  });
});
