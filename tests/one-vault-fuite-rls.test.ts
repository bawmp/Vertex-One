import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, secretVault, journalAccesSecretVault } from "@/db/schema";

/**
 * Isolation RLS standard entre deux entreprises fictives — `secretVault`/
 * `journalAccesSecretVault` n'ont aucune façade anonyme (contrairement à
 * `formulaire`/`champFormulaire` de One Form) : ce module n'est jamais
 * consulté sans session, donc une seule policy "isolation_entreprise"
 * suffit.
 */
describe("One Vault — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurMbargaId: string;
  let secretMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST OneVault Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST OneVault Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-onevault-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurMbargaId = uMbarga.id;

    const [secret] = await avecEntreprise(mbargaId, (tx) =>
      tx
        .insert(secretVault)
        .values({ entrepriseId: mbargaId, titre: "Compte Migadu", contenuChiffre: "blob-de-test-non-dechiffre", creeParId: utilisateurMbargaId })
        .returning({ id: secretVault.id })
    );
    secretMbargaId = secret.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(journalAccesSecretVault).where(eq(journalAccesSecretVault.entrepriseId, id));
        await tx.delete(secretVault).where(eq(secretVault.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne modifie pas et ne supprime pas le secret d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(secretVault).where(eq(secretVault.id, secretMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(secretVault).set({ titre: "Piraté" }).where(eq(secretVault.id, secretMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(secretVault).where(eq(secretVault.id, secretMbargaId)));
    expect(reel.titre).not.toBe("Piraté");

    await avecEntreprise(kiroId, (tx) => tx.delete(secretVault).where(eq(secretVault.id, secretMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(secretVault).where(eq(secretVault.id, secretMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("un secret reste invisible même sans session active (aucune façade anonyme dans ce module)", async () => {
    const lecture = await db.select().from(secretVault).where(eq(secretVault.id, secretMbargaId));
    expect(lecture).toHaveLength(0);
  });

  test("une entreprise ne voit pas le journal d'accès d'une autre", async () => {
    const [ligne] = await avecEntreprise(mbargaId, (tx) =>
      tx.insert(journalAccesSecretVault).values({ entrepriseId: mbargaId, secretId: secretMbargaId, utilisateurId: utilisateurMbargaId, action: "consultation" }).returning({ id: journalAccesSecretVault.id })
    );

    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(journalAccesSecretVault).where(eq(journalAccesSecretVault.id, ligne.id)));
    expect(lecture).toHaveLength(0);
  });
});
