import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, politiqueConge, politiqueCongePalier } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les deux
 * tables ajoutées avec les politiques de congé (politique_conge,
 * politique_conge_palier) — voir CLAUDE.md : "après chaque nouveau module
 * touchant à des données d'entreprise, un test délibéré doit vérifier
 * qu'une entreprise fictive ne peut techniquement pas accéder aux données
 * d'une autre."
 */
describe("Politiques de congé — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let politiqueMbargaId: string;
  let palierMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Politique Conge Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Politique Conge Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-politique-conge-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-politique-conge-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [pM, palM] = await avecEntreprise(mbargaId, async (tx) => {
      const [p] = await tx
        .insert(politiqueConge)
        .values({ entrepriseId: mbargaId, nom: "Congé Mbarga", type: "ANCIENNETE", joursBaseParAn: 18, creeParId: utilisateurMbargaId })
        .returning({ id: politiqueConge.id });
      const [pal] = await tx
        .insert(politiqueCongePalier)
        .values({ entrepriseId: mbargaId, politiqueCongeId: p.id, anneesAncienneteMin: 5, joursSupplementaires: 2 })
        .returning({ id: politiqueCongePalier.id });
      return [p.id, pal.id];
    });
    politiqueMbargaId = pM;
    palierMbargaId = palM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(politiqueCongePalier).where(eq(politiqueCongePalier.entrepriseId, id));
        await tx.delete(politiqueConge).where(eq(politiqueConge.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la politique de congé d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(politiqueConge).where(eq(politiqueConge.id, politiqueMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(politiqueConge).set({ nom: "pirate" }).where(eq(politiqueConge.id, politiqueMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(politiqueConge).where(eq(politiqueConge.id, politiqueMbargaId)));
    expect(reel.nom).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(politiqueConge).where(eq(politiqueConge.id, politiqueMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(politiqueConge).where(eq(politiqueConge.id, politiqueMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas le palier d'ancienneté d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(politiqueCongePalier).where(eq(politiqueCongePalier.id, palierMbargaId)));
    expect(lecture).toHaveLength(0);

    const large = await avecEntreprise(kiroId, (tx) => tx.select().from(politiqueCongePalier));
    expect(large.some((p) => p.id === palierMbargaId)).toBe(false);
  });
});
