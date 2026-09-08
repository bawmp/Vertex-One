import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossierRH, demandeDepart, clearanceDepart } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les deux
 * tables ajoutées avec l'offboarding (demande_depart, clearance_depart) —
 * voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Offboarding — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let demandeMbargaId: string;
  let clearanceMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Depart Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Depart Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-depart-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-depart-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const [dM, clM] = await avecEntreprise(mbargaId, async (tx) => {
      const [dossier] = await tx
        .insert(dossierRH)
        .values({ entrepriseId: mbargaId, utilisateurId: utilisateurMbargaId, poste: "Mécanicien", typeContrat: "CDI", dateEmbauche: new Date("2020-01-01") })
        .returning({ id: dossierRH.id });
      const [d] = await tx
        .insert(demandeDepart)
        .values({ entrepriseId: mbargaId, dossierRHId: dossier.id, type: "DEMISSION", dateDepartSouhaitee: new Date("2026-12-01"), creeParId: utilisateurMbargaId })
        .returning({ id: demandeDepart.id });
      const [cl] = await tx
        .insert(clearanceDepart)
        .values({ entrepriseId: mbargaId, demandeDepartId: d.id, libelle: "Restitution du matériel", responsableId: utilisateurMbargaId })
        .returning({ id: clearanceDepart.id });
      return [d.id, cl.id];
    });
    demandeMbargaId = dM;
    clearanceMbargaId = clM;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(clearanceDepart).where(eq(clearanceDepart.entrepriseId, id));
        await tx.delete(demandeDepart).where(eq(demandeDepart.entrepriseId, id));
        await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la demande de départ d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(demandeDepart).set({ statut: "CLOTUREE" }).where(eq(demandeDepart.id, demandeMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeMbargaId)));
    expect(reel.statut).not.toBe("CLOTUREE");

    await avecEntreprise(kiroId, (tx) => tx.delete(demandeDepart).where(eq(demandeDepart.id, demandeMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(demandeDepart).where(eq(demandeDepart.id, demandeMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("une entreprise ne voit pas, ne peut pas valider ni supprimer la clôture d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(clearanceDepart).where(eq(clearanceDepart.id, clearanceMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(clearanceDepart).set({ complete: true }).where(eq(clearanceDepart.id, clearanceMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(clearanceDepart).where(eq(clearanceDepart.id, clearanceMbargaId)));
    expect(reel.complete).toBe(false);

    await avecEntreprise(kiroId, (tx) => tx.delete(clearanceDepart).where(eq(clearanceDepart.id, clearanceMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(clearanceDepart).where(eq(clearanceDepart.id, clearanceMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
