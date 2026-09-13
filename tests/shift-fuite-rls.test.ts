import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, shift } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la table
 * ajoutée avec les shifts (shift) — voir CLAUDE.md : "après chaque nouveau
 * module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Shifts — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let shiftMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Shift Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Shift Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db.insert(utilisateur).values({ entrepriseId: kiroId, email: "admin-shift-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-shift-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    shiftMbargaId = await avecEntreprise(mbargaId, async (tx) => {
      const [s] = await tx
        .insert(shift)
        .values({ entrepriseId: mbargaId, nom: "Matin", heureDebut: "09:00:00", heureFin: "17:00:00", creeParId: utilisateurMbargaId })
        .returning({ id: shift.id });
      return s.id;
    });
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, (tx) => tx.delete(shift).where(eq(shift.entrepriseId, id)));
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer le shift d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(shift).where(eq(shift.id, shiftMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(shift).set({ nom: "pirate" }).where(eq(shift.id, shiftMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(shift).where(eq(shift.id, shiftMbargaId)));
    expect(reel.nom).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(shift).where(eq(shift.id, shiftMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(shift).where(eq(shift.id, shiftMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
