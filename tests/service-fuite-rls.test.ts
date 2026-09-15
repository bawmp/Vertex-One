import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, service } from "@/db/schema";

/**
 * Départements/services (2026-09-15) — test de fuite délibérée entre deux
 * entreprises fictives, voir CLAUDE.md. RLS strictement standard, même
 * patron que tests/journal-action-plateforme-fuite-rls.test.ts.
 */
describe("Service (département) — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let serviceMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Service Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Service Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-service-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-service-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbarga.id;

    serviceMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [ligne] = await tx.insert(service).values({ entrepriseId: mbargaId, nom: "Ventes" }).returning({ id: service.id });
      return ligne.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, (tx) => tx.delete(service).where(eq(service.entrepriseId, mbargaId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais les départements d'une autre", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(service).where(eq(service.id, serviceMbargaId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("aucune lecture anonyme — une requête sans session ne renvoie rien", async () => {
    const sansSession = await db.select().from(service).where(eq(service.id, serviceMbargaId));
    expect(sansSession).toHaveLength(0);
  });

  test("l'entreprise propriétaire voit bien son propre département", async () => {
    const depuisMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(service).where(eq(service.id, serviceMbargaId)));
    expect(depuisMbarga).toHaveLength(1);
    expect(depuisMbarga[0].nom).toBe("Ventes");
  });
});
