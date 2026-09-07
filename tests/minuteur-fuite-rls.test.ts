import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, minuteurActif } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour le minuteur
 * démarrer/arrêter (échange du 2026-09-07) — voir CLAUDE.md : "après chaque
 * nouveau module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Minuteur démarrer/arrêter — isolation RLS entre entreprises (minuteur_actif)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let minuteurMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Minuteur Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Minuteur Mbarga", secteurProfil: "agence" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-minuteur-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-minuteur-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [m] = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Contact Mbarga", telephone: "+237600000097", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx.insert(dossier).values({ entrepriseId: mbargaId, contactId: c.id, titre: "Dossier Mbarga", responsableId: utilisateurMbargaId }).returning({ id: dossier.id });
      const [p] = await tx
        .insert(projet)
        .values({ entrepriseId: mbargaId, dossierId: d.id, titre: "Projet Mbarga", responsablePrincipalId: utilisateurMbargaId })
        .returning({ id: projet.id });
      const [actif] = await tx
        .insert(minuteurActif)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, projetId: p.id })
        .returning({ id: minuteurActif.id });
      return [actif.id];
    });
    minuteurMbargaId = m;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(minuteurActif).where(eq(minuteurActif.entrepriseId, id));
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

  test("une entreprise ne voit pas le minuteur actif d'une autre, même en ciblant son id précis", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(minuteurActif));
    expect(vusParKiro.some((m) => m.id === minuteurMbargaId)).toBe(false);

    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(minuteurActif).where(eq(minuteurActif.id, minuteurMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut ni arrêter (supprimer) ni modifier le minuteur d'une autre", async () => {
    await avecEntreprise(kiroId, (tx) => tx.delete(minuteurActif).where(eq(minuteurActif.id, minuteurMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(minuteurActif).where(eq(minuteurActif.id, minuteurMbargaId)));
    expect(toujoursLa).toBeDefined();

    const nouvelleDate = new Date(0);
    await avecEntreprise(kiroId, (tx) => tx.update(minuteurActif).set({ demarreLe: nouvelleDate }).where(eq(minuteurActif.id, minuteurMbargaId)));
    const [inchange] = await avecEntreprise(mbargaId, (tx) => tx.select().from(minuteurActif).where(eq(minuteurActif.id, minuteurMbargaId)));
    expect(inchange.demarreLe.getTime()).not.toBe(nouvelleDate.getTime());
  });
});
