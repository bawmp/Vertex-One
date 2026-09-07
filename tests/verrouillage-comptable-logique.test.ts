import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, ecritureComptable, compteComptable } from "@/db/schema";
import { genererEcrituresDepense } from "@/lib/comptabilite/ecritures";
import { verifierDateNonVerrouillee } from "@/lib/comptabilite/verrouillage";

/**
 * Vérifie le Verrouillage de transactions (échange du 2026-09-07) :
 * verifierDateNonVerrouillee() (fonction pure) et son intégration dans
 * creerEcritures() (point de passage unique de toute écriture comptable,
 * voir src/lib/comptabilite/ecritures.ts) — testée ici via
 * genererEcrituresDepense(), un appelant représentatif parmi d'autres
 * (Facture, Paiement, Reçu, Facture fournisseur suivent le même chemin).
 */
describe("Verrouillage de transactions — logique métier", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Verrouillage Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-verrouillage-logique@vertexone.test", nomComplet: "Admin Verrouillage Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [compteCharge] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 6)).limit(1);
    compteChargeId = compteCharge.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("verifierDateNonVerrouillee() : aucune contrainte quand la date de verrouillage est nulle", () => {
    expect(verifierDateNonVerrouillee(null, new Date("2020-01-01"))).toBeNull();
  });

  test("verifierDateNonVerrouillee() : refuse une date antérieure ou égale à la date de verrouillage", () => {
    const verrou = new Date("2026-06-30");
    expect(verifierDateNonVerrouillee(verrou, new Date("2026-06-30"))).not.toBeNull();
    expect(verifierDateNonVerrouillee(verrou, new Date("2026-01-01"))).not.toBeNull();
    expect(verifierDateNonVerrouillee(verrou, new Date("2026-07-01"))).toBeNull();
  });

  test("sans verrouillage, genererEcrituresDepense() accepte n'importe quelle date", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresDepense(tx, {
        id: "depense-test-sans-verrou",
        entrepriseId,
        libelle: "Dépense test sans verrouillage",
        compteComptableId: compteChargeId,
        montantHT: 1000,
        montantTVA: 0,
        montantTTC: 1000,
        moyenPaiement: "manuel",
        datePaiement: new Date("2020-01-01"),
      })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.depenseId, "depense-test-sans-verrou")));
    expect(lignes.length).toBeGreaterThan(0);
  });

  test("avec un verrouillage, une écriture datée avant (ou à) la date de verrouillage est refusée et rien n'est inséré", async () => {
    const dateVerrouillage = new Date("2026-06-30");
    await avecEntreprise(entrepriseId, (tx) => tx.update(entreprise).set({ dateVerrouillageComptable: dateVerrouillage }).where(eq(entreprise.id, entrepriseId)));

    await expect(
      avecEntreprise(entrepriseId, (tx) =>
        genererEcrituresDepense(tx, {
          id: "depense-test-verrouillee",
          entrepriseId,
          libelle: "Dépense test verrouillée",
          compteComptableId: compteChargeId,
          montantHT: 2000,
          montantTVA: 0,
          montantTTC: 2000,
          moyenPaiement: "manuel",
          datePaiement: new Date("2026-05-01"),
        })
      )
    ).rejects.toThrow(/verrouillée/);

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.depenseId, "depense-test-verrouillee")));
    expect(lignes).toHaveLength(0);

    // Une date après le verrouillage reste acceptée.
    await avecEntreprise(entrepriseId, (tx) =>
      genererEcrituresDepense(tx, {
        id: "depense-test-apres-verrou",
        entrepriseId,
        libelle: "Dépense test après verrouillage",
        compteComptableId: compteChargeId,
        montantHT: 3000,
        montantTVA: 0,
        montantTTC: 3000,
        moyenPaiement: "manuel",
        datePaiement: new Date("2026-07-01"),
      })
    );
    const lignesApres = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.depenseId, "depense-test-apres-verrou")));
    expect(lignesApres.length).toBeGreaterThan(0);

    await avecEntreprise(entrepriseId, (tx) => tx.update(entreprise).set({ dateVerrouillageComptable: null }).where(eq(entreprise.id, entrepriseId)));
  });
});
