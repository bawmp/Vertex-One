import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, tache, commentaire } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les quatre
 * tables ajoutées au Palier 2 (dossier, projet, tache, commentaire) — voir
 * CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre." Même structure
 * que tests/palier-0-isolation-multi-tenant.test.ts.
 */
describe("Palier 2 — isolation RLS entre entreprises (dossier/projet/tache/commentaire)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let dossierKiroId: string;
  let dossierMbargaId: string;
  let projetKiroId: string;
  let projetMbargaId: string;
  let tacheMbargaId: string;
  let commentaireMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST P2 Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST P2 Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-p2-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-p2-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [dK, pK] = await avecEntreprise(kiroId, async (tx) => {
      const [pr] = await tx
        .insert(contact)
        .values({ entrepriseId: kiroId, nom: "Client Kiro", telephone: "+237600000001", assigneAId: utilisateurKiroId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId: kiroId, contactId: pr.id, titre: "Dossier Kiro", responsableId: utilisateurKiroId })
        .returning({ id: dossier.id });
      const [p] = await tx
        .insert(projet)
        .values({ entrepriseId: kiroId, dossierId: d.id, titre: "Projet Kiro", responsablePrincipalId: utilisateurKiroId })
        .returning({ id: projet.id });
      return [d.id, p.id];
    });
    dossierKiroId = dK;
    projetKiroId = pK;

    const [dM, pM, tM, cM] = await avecEntreprise(mbargaId, async (tx) => {
      const [pr] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Client Mbarga", telephone: "+237600000002", assigneAId: utilisateurMbargaId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId: mbargaId, contactId: pr.id, titre: "Dossier Mbarga", responsableId: utilisateurMbargaId })
        .returning({ id: dossier.id });
      const [p] = await tx
        .insert(projet)
        .values({ entrepriseId: mbargaId, dossierId: d.id, titre: "Projet Mbarga", responsablePrincipalId: utilisateurMbargaId })
        .returning({ id: projet.id });
      const [t] = await tx
        .insert(tache)
        .values({ entrepriseId: mbargaId, projetId: p.id, titre: "Tâche Mbarga", assigneAId: utilisateurMbargaId, creeParId: utilisateurMbargaId })
        .returning({ id: tache.id });
      const [c] = await tx
        .insert(commentaire)
        .values({ entrepriseId: mbargaId, dossierId: d.id, auteurId: utilisateurMbargaId, contenu: "Commentaire Mbarga" })
        .returning({ id: commentaire.id });
      return [d.id, p.id, t.id, c.id];
    });
    dossierMbargaId = dM;
    projetMbargaId = pM;
    tacheMbargaId = tM;
    commentaireMbargaId = cM;
  }, 30_000); // deux entreprises, deux transactions à plusieurs insertions chacune — au-delà du budget par défaut (10s) sous latence Neon réelle, voir CLAUDE.md.

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(commentaire).where(eq(commentaire.entrepriseId, id));
        await tx.delete(tache).where(eq(tache.entrepriseId, id));
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

  test("une entreprise ne voit pas les dossiers d'une autre, même en lecture large", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(dossier));
    expect(vusParKiro.some((d) => d.id === dossierKiroId)).toBe(true);
    expect(vusParKiro.some((d) => d.id === dossierMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire le dossier d'une autre en ciblant son id précis", async () => {
    const tentative = await avecEntreprise(kiroId, (tx) => tx.select().from(dossier).where(eq(dossier.id, dossierMbargaId)));
    expect(tentative).toHaveLength(0);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le projet d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(projet).where(eq(projet.id, projetMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(projet).set({ titre: "Piraté depuis Kiro" }).where(eq(projet.id, projetMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(projet).where(eq(projet.id, projetMbargaId)));
    expect(reel.titre).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(projet).where(eq(projet.id, projetMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(projet).where(eq(projet.id, projetMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne peut pas lire la tâche ni le commentaire d'une autre", async () => {
    const tache_ = await avecEntreprise(kiroId, (tx) => tx.select().from(tache).where(eq(tache.id, tacheMbargaId)));
    expect(tache_).toHaveLength(0);

    const commentaire_ = await avecEntreprise(kiroId, (tx) => tx.select().from(commentaire).where(eq(commentaire.id, commentaireMbargaId)));
    expect(commentaire_).toHaveLength(0);
  });

  test("le projet créé par Kiro reste invisible à Mbarga", async () => {
    const tentative = await avecEntreprise(mbargaId, (tx) => tx.select().from(projet).where(eq(projet.id, projetKiroId)));
    expect(tentative).toHaveLength(0);
  });
});
