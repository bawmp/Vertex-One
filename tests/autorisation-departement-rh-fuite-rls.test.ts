import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, service, autorisationDepartementRh } from "@/db/schema";

/**
 * Autorisations de département RH (2026-09-15) — test de fuite délibérée
 * entre deux entreprises fictives, voir CLAUDE.md. RLS strictement
 * standard, même patron que tests/service-fuite-rls.test.ts.
 */
describe("Autorisation département RH — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let managerKiroId: string;
  let managerMbargaId: string;
  let serviceMbargaId: string;
  let autorisationMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Autorisation Dept Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Autorisation Dept Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "manager-ad-kiro@vertexone.test", nomComplet: "Manager Kiro", role: "MANAGER" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "manager-ad-mbarga@vertexone.test", nomComplet: "Manager Mbarga", role: "MANAGER" })
      .returning({ id: utilisateur.id });
    managerKiroId = uKiro.id;
    managerMbargaId = uMbarga.id;

    const [svcMbarga] = await avecEntreprise(mbargaId, (tx) => tx.insert(service).values({ entrepriseId: mbargaId, nom: "Ventes Mbarga" }).returning({ id: service.id }));
    serviceMbargaId = svcMbarga.id;

    autorisationMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [ligne] = await tx
        .insert(autorisationDepartementRh)
        .values({ entrepriseId: mbargaId, utilisateurId: managerMbargaId, serviceId: serviceMbargaId })
        .returning({ id: autorisationDepartementRh.id });
      return ligne.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, (tx) => tx.delete(autorisationDepartementRh).where(eq(autorisationDepartementRh.entrepriseId, mbargaId)));
    await avecEntreprise(mbargaId, (tx) => tx.delete(service).where(eq(service.entrepriseId, mbargaId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, managerKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, managerMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais les autorisations de département d'une autre", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(autorisationDepartementRh).where(eq(autorisationDepartementRh.id, autorisationMbargaId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("aucune lecture anonyme — une requête sans session ne renvoie rien", async () => {
    const sansSession = await db.select().from(autorisationDepartementRh).where(eq(autorisationDepartementRh.id, autorisationMbargaId));
    expect(sansSession).toHaveLength(0);
  });

  test("l'entreprise propriétaire voit bien sa propre autorisation", async () => {
    const depuisMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(autorisationDepartementRh).where(eq(autorisationDepartementRh.id, autorisationMbargaId)));
    expect(depuisMbarga).toHaveLength(1);
    expect(depuisMbarga[0].utilisateurId).toBe(managerMbargaId);
  });
});
