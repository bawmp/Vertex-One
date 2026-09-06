import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, tacheCrm, reunionCrm } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les
 * Activités CRM (Accueil, inspiré de Zoho CRM, échange du 2026-09-06) — voir
 * CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("CRM — isolation RLS entre entreprises (tache_crm/reunion_crm)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let tacheMbargaId: string;
  let reunionMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST CRM Activites Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST CRM Activites Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-activites-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-activites-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    await avecEntreprise(kiroId, (tx) =>
      tx.insert(tacheCrm).values({ entrepriseId: kiroId, objet: "Tâche Kiro", assigneAId: utilisateurKiroId, creeParId: utilisateurKiroId })
    );

    const [tM, rM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000034", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [t] = await tx
        .insert(tacheCrm)
        .values({ entrepriseId: mbargaId, objet: "Tâche Mbarga", contactId: c.id, assigneAId: utilisateurMbargaId, creeParId: utilisateurMbargaId })
        .returning({ id: tacheCrm.id });
      const [r] = await tx
        .insert(reunionCrm)
        .values({
          entrepriseId: mbargaId,
          titre: "Réunion Mbarga",
          dateDebut: new Date(),
          dateFin: new Date(Date.now() + 1000 * 60 * 60),
          contactId: c.id,
          assigneAId: utilisateurMbargaId,
          creeParId: utilisateurMbargaId,
        })
        .returning({ id: reunionCrm.id });
      return [t.id, r.id];
    });
    tacheMbargaId = tM;
    reunionMbargaId = rM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(reunionCrm).where(eq(reunionCrm.entrepriseId, id));
        await tx.delete(tacheCrm).where(eq(tacheCrm.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les tâches CRM d'une autre, même en lecture large", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(tacheCrm));
    expect(vusParKiro.some((t) => t.id === tacheMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(tacheCrm).where(eq(tacheCrm.id, tacheMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer la réunion d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(reunionCrm).where(eq(reunionCrm.id, reunionMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(reunionCrm).set({ titre: "Piraté depuis Kiro" }).where(eq(reunionCrm.id, reunionMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(reunionCrm).where(eq(reunionCrm.id, reunionMbargaId)));
    expect(reel.titre).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(reunionCrm).where(eq(reunionCrm.id, reunionMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(reunionCrm).where(eq(reunionCrm.id, reunionMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
