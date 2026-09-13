import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, posteOuvert, candidature, parametreRecrutement } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives — voir CLAUDE.md :
 * "après chaque nouveau module touchant à des données d'entreprise, un test
 * délibéré doit vérifier qu'une entreprise fictive ne peut techniquement pas
 * accéder aux données d'une autre."
 */
describe("Recrutement — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let posteMbargaId: string;
  let candidatureMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Recrutement Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Recrutement Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db.insert(utilisateur).values({ entrepriseId: kiroId, email: "admin-recrutement-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-recrutement-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    await avecEntreprise(mbargaId, async (tx) => {
      const [p] = await tx.insert(posteOuvert).values({ entrepriseId: mbargaId, titre: "Mécanicien", creeParId: utilisateurMbargaId }).returning({ id: posteOuvert.id });
      posteMbargaId = p.id;
      const [c] = await tx
        .insert(candidature)
        .values({ entrepriseId: mbargaId, posteId: posteMbargaId, nom: "Candidat Mbarga", telephone: "699222222", cvCleStockage: "x", cvNomFichier: "cv.pdf", cvTypeMime: "application/pdf", cvTailleOctets: 1000 })
        .returning({ id: candidature.id });
      candidatureMbargaId = c.id;
    });
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(candidature).where(eq(candidature.entrepriseId, id));
        await tx.delete(posteOuvert).where(eq(posteOuvert.entrepriseId, id));
        await tx.delete(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la candidature d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(candidature).where(eq(candidature.id, candidatureMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(candidature).set({ nom: "pirate" }).where(eq(candidature.id, candidatureMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(candidature).where(eq(candidature.id, candidatureMbargaId)));
    expect(reel.nom).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(candidature).where(eq(candidature.id, candidatureMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(candidature).where(eq(candidature.id, candidatureMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("parametreRecrutement : visible anonymement seulement quand publie = true", async () => {
    await avecEntreprise(mbargaId, (tx) => tx.insert(parametreRecrutement).values({ entrepriseId: mbargaId, slug: `test-fuite-recrutement-${Date.now()}`, publie: false }));

    const [ligne] = await avecEntreprise(mbargaId, (tx) => tx.select({ slug: parametreRecrutement.slug }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, mbargaId)));

    const anonymeAvant = await db.select().from(parametreRecrutement).where(eq(parametreRecrutement.slug, ligne.slug));
    expect(anonymeAvant).toHaveLength(0);

    await avecEntreprise(mbargaId, (tx) => tx.update(parametreRecrutement).set({ publie: true }).where(eq(parametreRecrutement.entrepriseId, mbargaId)));

    const anonymeApres = await db.select().from(parametreRecrutement).where(eq(parametreRecrutement.slug, ligne.slug));
    expect(anonymeApres).toHaveLength(1);
  });
});
