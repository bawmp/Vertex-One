import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, campagne, pageAtterrissage, addonActif } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les trois
 * tables ajoutées au Palier 6 (campagne, page_atterrissage, addon_actif) —
 * voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Palier 6 — isolation RLS entre entreprises (campagnes/pages/addons)", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let campagneMbargaId: string;
  let pageMbargaId: string;
  let addonMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST P6 Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST P6 Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-p6-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-p6-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [c, p, a] = await avecEntreprise(mbargaId, async (tx) => {
      const [camp] = await tx
        .insert(campagne)
        .values({ entrepriseId: mbargaId, nom: "Relance Mbarga", canal: "EMAIL", contenu: "Bonjour", segment: { statut: "PERDU" }, creeParId: utilisateurMbargaId })
        .returning({ id: campagne.id });
      const [page] = await tx
        .insert(pageAtterrissage)
        .values({ entrepriseId: mbargaId, slug: `garage-mbarga-${mbargaId}`, titre: "Garage Mbarga", texte: "Bienvenue", publiee: false })
        .returning({ id: pageAtterrissage.id });
      const [addon] = await tx
        .insert(addonActif)
        .values({ entrepriseId: mbargaId, addon: "MARKETING", prixMensuel: 10_000 })
        .returning({ id: addonActif.id });

      return [camp.id, page.id, addon.id];
    });
    campagneMbargaId = c;
    pageMbargaId = p;
    addonMbargaId = a;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(campagne).where(eq(campagne.entrepriseId, id));
        await tx.delete(pageAtterrissage).where(eq(pageAtterrissage.entrepriseId, id));
        await tx.delete(addonActif).where(eq(addonActif.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne modifie pas et ne supprime pas la campagne d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(campagne).where(eq(campagne.id, campagneMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(campagne).set({ nom: "Piraté" }).where(eq(campagne.id, campagneMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(campagne).where(eq(campagne.id, campagneMbargaId)));
    expect(reel.nom).not.toBe("Piraté");

    await avecEntreprise(kiroId, (tx) => tx.delete(campagne).where(eq(campagne.id, campagneMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(campagne).where(eq(campagne.id, campagneMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise avec une session active ne voit pas la page d'atterrissage non publiée d'une autre, même en la ciblant précisément", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(pageAtterrissage).where(eq(pageAtterrissage.id, pageMbargaId)));
    expect(lecture).toHaveLength(0);
  });

  test("une page d'atterrissage non publiée reste invisible même sans session active (pas seulement une histoire d'entreprise)", async () => {
    const lecture = await db.select().from(pageAtterrissage).where(eq(pageAtterrissage.id, pageMbargaId));
    expect(lecture).toHaveLength(0);
  });

  test("une page d'atterrissage publiée devient lisible sans session, mais reste non modifiable", async () => {
    await avecEntreprise(mbargaId, (tx) => tx.update(pageAtterrissage).set({ publiee: true }).where(eq(pageAtterrissage.id, pageMbargaId)));

    const [lecturePublique] = await db.select().from(pageAtterrissage).where(eq(pageAtterrissage.id, pageMbargaId));
    expect(lecturePublique).toBeDefined();
    expect(lecturePublique.publiee).toBe(true);

    // Écriture toujours stricte, même une fois publiée, même sans session.
    await db.update(pageAtterrissage).set({ titre: "Piraté" }).where(eq(pageAtterrissage.id, pageMbargaId));
    const [apresTentative] = await db.select().from(pageAtterrissage).where(eq(pageAtterrissage.id, pageMbargaId));
    expect(apresTentative.titre).not.toBe("Piraté");
  });

  test("une entreprise ne voit pas l'addon actif d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(addonActif).where(eq(addonActif.id, addonMbargaId)));
    expect(lecture).toHaveLength(0);
  });
});
