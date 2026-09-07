import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, entreeTemps } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour le Suivi
 * des heures (échange du 2026-09-07) — voir CLAUDE.md : "après chaque
 * nouveau module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Suivi des heures — isolation RLS entre entreprises (entree_temps)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let entreeMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Heures Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Heures Mbarga", secteurProfil: "agence" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-heures-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-heures-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [eM] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000098", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId: mbargaId, contactId: c.id, titre: "Dossier Mbarga", responsableId: utilisateurMbargaId })
        .returning({ id: dossier.id });
      const [p] = await tx
        .insert(projet)
        .values({ entrepriseId: mbargaId, dossierId: d.id, titre: "Projet Mbarga", responsablePrincipalId: utilisateurMbargaId })
        .returning({ id: projet.id });
      const [entree] = await tx
        .insert(entreeTemps)
        .values({ entrepriseId: mbargaId, projetId: p.id, utilisateurId: utilisateurMbargaId, date: new Date(), dureeHeures: 3, tauxHoraire: 5000 })
        .returning({ id: entreeTemps.id });
      return [entree.id];
    });
    entreeMbargaId = eM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(entreeTemps).where(eq(entreeTemps.entrepriseId, id));
        await tx.delete(projet).where(eq(projet.entrepriseId, id));
        await tx.delete(dossier).where(eq(dossier.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas l'entrée de temps d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(entreeTemps));
    expect(vusParKiro.some((e) => e.id === entreeMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entreeMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas modifier ni supprimer l'entrée de temps d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.update(entreeTemps).set({ dureeHeures: 999 }).where(eq(entreeTemps.id, entreeMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entreeMbargaId)));
    expect(reel.dureeHeures).toBe(3);

    await avecEntreprise(kiroId, (tx) => tx.delete(entreeTemps).where(eq(entreeTemps.id, entreeMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entreeMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
