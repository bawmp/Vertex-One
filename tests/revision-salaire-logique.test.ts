import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, desc } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, dossierRH, revisionSalaire } from "@/db/schema";

/**
 * Reproduit la logique de reviserSalaire() (src/lib/actions/revision-salaire.ts)
 * — indisponible hors requête HTTP réelle dans ce test (dépend de
 * recupererUtilisateurConnecte()) — pour vérifier que chaque révision
 * capture bien l'ancien salaire AVANT de l'écraser, et que l'historique
 * s'accumule dans l'ordre plutôt que de remplacer la ligne précédente.
 */
async function reviserSalairePourTest(entrepriseId: string, dossierRHId: string, adminId: string, nouveauSalaire: number, motif?: string) {
  await avecEntreprise(entrepriseId, async (tx) => {
    const [leDossier] = await tx.select({ salaireBase: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));
    await tx.insert(revisionSalaire).values({
      entrepriseId,
      dossierRHId,
      ancienSalaire: leDossier.salaireBase,
      nouveauSalaire,
      motif,
      effectueParId: adminId,
    });
    await tx.update(dossierRH).set({ salaireBase: nouveauSalaire }).where(eq(dossierRH.id, dossierRHId));
  });
}

describe("Révisions de salaire — logique métier", () => {
  let entrepriseId: string;
  let adminId: string;
  let dossierRHId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Revision Salaire Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-revision-salaire-logique@vertexone.test", nomComplet: "Admin Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminId = admin.id;

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(dossierRH).values({ entrepriseId, utilisateurId: adminId, poste: "Gérant", typeContrat: "CDI", dateEmbauche: new Date("2020-01-01") }).returning({ id: dossierRH.id })
    );
    dossierRHId = d.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(revisionSalaire).where(eq(revisionSalaire.entrepriseId, entrepriseId));
      await tx.delete(dossierRH).where(eq(dossierRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("la première révision capture un ancien salaire NULL (aucun salaire fixé auparavant)", async () => {
    await reviserSalairePourTest(entrepriseId, dossierRHId, adminId, 150000, "Salaire initial");

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select({ salaireBase: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.salaireBase).toBe(150000);

    const revisions = await avecEntreprise(entrepriseId, (tx) => tx.select().from(revisionSalaire).where(eq(revisionSalaire.dossierRHId, dossierRHId)));
    expect(revisions).toHaveLength(1);
    expect(revisions[0].ancienSalaire).toBeNull();
    expect(revisions[0].nouveauSalaire).toBe(150000);
  });

  test("une deuxième révision capture le salaire précédent comme ancienSalaire, sans effacer la première ligne d'historique", async () => {
    await reviserSalairePourTest(entrepriseId, dossierRHId, adminId, 180000, "Augmentation annuelle");

    const [dossier] = await avecEntreprise(entrepriseId, (tx) => tx.select({ salaireBase: dossierRH.salaireBase }).from(dossierRH).where(eq(dossierRH.id, dossierRHId)));
    expect(dossier.salaireBase).toBe(180000);

    const revisions = await avecEntreprise(entrepriseId, (tx) => tx.select().from(revisionSalaire).where(eq(revisionSalaire.dossierRHId, dossierRHId)).orderBy(desc(revisionSalaire.creeLe)));
    expect(revisions).toHaveLength(2);
    expect(revisions[0].ancienSalaire).toBe(150000);
    expect(revisions[0].nouveauSalaire).toBe(180000);
    expect(revisions[0].motif).toBe("Augmentation annuelle");
    // La première ligne reste intacte, jamais écrasée.
    expect(revisions[1].ancienSalaire).toBeNull();
    expect(revisions[1].nouveauSalaire).toBe(150000);
  });
});
