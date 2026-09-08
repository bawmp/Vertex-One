import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, revisionSalaire } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour la table
 * ajoutée avec l'historique des révisions de salaire (revision_salaire) —
 * voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Révisions de salaire — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let dossierMbargaId: string;
  let revisionMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Revision Salaire Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Revision Salaire Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-revision-salaire-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-revision-salaire-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [dM, rM] = await avecEntreprise(mbargaId, async (tx) => {
      const [d] = await tx
        .insert(dossierRH)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, poste: "Gérant", typeContrat: "CDI", dateEmbauche: new Date("2020-01-01"), salaireBase: 200000 })
        .returning({ id: dossierRH.id });
      const [r] = await tx
        .insert(revisionSalaire)
        .values({ entrepriseId: mbargaId, dossierRHId: d.id, ancienSalaire: null, nouveauSalaire: 200000, effectueParId: utilisateurMbargaId })
        .returning({ id: revisionSalaire.id });
      return [d.id, r.id];
    });
    dossierMbargaId = dM;
    revisionMbargaId = rM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(revisionSalaire).where(eq(revisionSalaire.entrepriseId, id));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la révision de salaire d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(revisionSalaire).where(eq(revisionSalaire.id, revisionMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(revisionSalaire).set({ nouveauSalaire: 1 }).where(eq(revisionSalaire.id, revisionMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(revisionSalaire).where(eq(revisionSalaire.id, revisionMbargaId)));
    expect(reel.nouveauSalaire).toBe(200000);

    await avecEntreprise(kiroId, (tx) => tx.delete(revisionSalaire).where(eq(revisionSalaire.id, revisionMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(revisionSalaire).where(eq(revisionSalaire.id, revisionMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas le dossier RH d'une autre via une jointure large", async () => {
    const large = await avecEntreprise(kiroId, (tx) => tx.select().from(revisionSalaire));
    expect(large.some((r) => r.id === revisionMbargaId)).toBe(false);

    const dossier = await avecEntreprise(kiroId, (tx) => tx.select().from(dossierRH).where(eq(dossierRH.id, dossierMbargaId)));
    expect(dossier).toHaveLength(0);
  });
});
