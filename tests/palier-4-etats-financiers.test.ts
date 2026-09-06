import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, ecritureComptable } from "@/db/schema";
import { genererEcrituresFactureEmise, genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { calculerBalance, calculerCompteDeResultat, calculerBilan } from "@/lib/comptabilite/etats-financiers";

/**
 * Rejoue un cas simple (une facture émise, encaissée en Caisse) contre le
 * référentiel SYSCOHADA réellement importé — docs/palier-4-*, section 7,
 * étape 4 : "testée en rejouant l'historique réel [...] pour vérifier que
 * les totaux calculés correspondent à ce qu'ils attendent."
 */
describe("Palier 4 — états financiers (Compte de résultat / Bilan)", () => {
  let entrepriseId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST P4 États Financiers Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      await genererEcrituresFactureEmise(tx, {
        id: "facture-etats-1",
        entrepriseId,
        numero: "FAC-TEST-ETATS-0001",
        dateEmission: new Date(),
        montantHT: 100_000,
        montantTVA: 19_250,
        montantTTC: 119_250,
      });
      await genererEcrituresPaiement(tx, {
        entrepriseId,
        factureId: "facture-etats-1",
        paiementId: "paiement-etats-1",
        numeroFacture: "FAC-TEST-ETATS-0001",
        montant: 119_250,
        moyenPaiement: "manuel",
        datePaiement: new Date(),
      });
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("le Compte de résultat reflète les produits HT et le résultat net", async () => {
    const balance = await avecEntreprise(entrepriseId, (tx) => calculerBalance(tx, entrepriseId));
    const compteDeResultat = calculerCompteDeResultat(balance);

    expect(compteDeResultat.totalProduits).toBe(100_000);
    expect(compteDeResultat.totalCharges).toBe(0);
    expect(compteDeResultat.resultatNet).toBe(100_000);
  });

  test("le Bilan est équilibré (total actif = total passif) après encaissement complet", async () => {
    const balance = await avecEntreprise(entrepriseId, (tx) => calculerBalance(tx, entrepriseId));
    const bilan = calculerBilan(balance);

    // Client soldé (encaissé) + Caisse créditée du montant TTC = actif TTC ;
    // passif = TVA collectée (dette envers l'État) + résultat net HT.
    expect(bilan.totalActif).toBe(119_250);
    expect(bilan.totalPassif).toBe(119_250);
  });
});
