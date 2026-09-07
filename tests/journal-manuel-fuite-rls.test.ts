import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, journalManuel } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les
 * Journaux manuels (échange du 2026-09-07) — voir CLAUDE.md : "après chaque
 * nouveau module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Journaux manuels — isolation RLS entre entreprises (journal_manuel)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let journalMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Journal Manuel Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Journal Manuel Mbarga", secteurProfil: "agence" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-journal-manuel-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-journal-manuel-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [j] = await avecEntreprise(mbargaId, (tx) =>
      tx
        .insert(journalManuel)
        .values({ entrepriseId: mbargaId, numero: "JM-2026-000001", libelle: "Journal Mbarga", dateEcriture: new Date(), creeParId: utilisateurMbargaId })
        .returning({ id: journalManuel.id })
    );
    journalMbargaId = j.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, (tx) => tx.delete(journalManuel).where(eq(journalManuel.entrepriseId, id)));
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas le journal manuel d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(journalManuel));
    expect(vusParKiro.some((j) => j.id === journalMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(journalManuel).where(eq(journalManuel.id, journalMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut ni modifier ni supprimer le journal manuel d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(journalManuel).set({ libelle: "Modifié par Kiro" }).where(eq(journalManuel.id, journalMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(journalManuel).where(eq(journalManuel.id, journalMbargaId)));
    expect(reel.libelle).toBe("Journal Mbarga");

    await avecEntreprise(kiroId, (tx) => tx.delete(journalManuel).where(eq(journalManuel.id, journalMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(journalManuel).where(eq(journalManuel.id, journalMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
