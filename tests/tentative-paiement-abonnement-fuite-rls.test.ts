import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, tentativePaiementAbonnement } from "@/db/schema";

/**
 * Abonnement plat CinetPay (2026-09-14) — test de fuite délibérée entre deux
 * entreprises fictives, voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre." Même structure que tests/tentative-paiement-facture-fuite-rls.test.ts —
 * RLS strictement standard (contrairement à `invitation`), aucune lecture
 * anonyme : le webhook retrouve l'entrepriseId via le préfixage du
 * transaction_id (voir tests/cinetpay-logique.test.ts), jamais via une
 * policy dérogatoire.
 */
describe("Tentative de paiement Abonnement — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let tentativeMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Tentative Abonnement Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Tentative Abonnement Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-ta-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-ta-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbarga.id;

    tentativeMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [tentative] = await tx.insert(tentativePaiementAbonnement).values({ entrepriseId: mbargaId, montant: 50_000 }).returning({ id: tentativePaiementAbonnement.id });
      return tentative.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, (tx) => tx.delete(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.entrepriseId, mbargaId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais la tentative de paiement d'une autre", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeMbargaId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("aucune lecture anonyme (contrairement à invitation) — une requête sans session ne renvoie rien", async () => {
    const sansSession = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeMbargaId));
    expect(sansSession).toHaveLength(0);
  });

  test("l'entreprise propriétaire voit bien sa propre tentative", async () => {
    const depuisMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeMbargaId)));
    expect(depuisMbarga).toHaveLength(1);
    expect(depuisMbarga[0].statut).toBe("EN_ATTENTE");
    expect(depuisMbarga[0].montant).toBe(50_000);
  });
});
