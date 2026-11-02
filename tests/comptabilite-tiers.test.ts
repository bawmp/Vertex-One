import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { avoirClient, compteComptable, contact, ecritureComptable, entreprise, facture, factureFournisseur, fournisseur, paiement, paiementEffectue, utilisateur } from "@/db/schema";
import {
  calculerLettrage,
  construireBalanceAgee,
  construireGrandLivreAuxiliaire,
  lettreDuRang,
  lireBalanceAgee,
  lireGrandLivreAuxiliaire,
  listerTiersAvecEcritures,
  trancheDeRetard,
  type LigneAuxiliaire,
} from "@/lib/comptabilite/tiers";
import { csvBalanceAgee, csvGrandLivreAuxiliaire } from "@/lib/comptabilite/tiers-export";
import { dateDouala } from "@/lib/comptabilite/livres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const ligne = (id: string, tiersId: string, nom: string, doc: string | null, debit: number, credit: number, date = "2026-03-10"): LigneAuxiliaire => ({ id, date: new Date(`${date}T10:00:00Z`), libelle: "x", debit, credit, tiersId, tiersNom: nom, documentId: doc, documentNumero: doc });

describe("Comptes de tiers — règles pures", () => {
  test("lettres : A…Z puis AA, AB", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(lettreDuRang)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  test("lettrage : un document dont les écritures s'annulent est lettré, les lettres suivent l'ordre des dates", () => {
    const l = [
      ligne("1", "c1", "Alpha", "F2", 500, 0, "2026-03-20"),
      ligne("2", "c1", "Alpha", "F2", 0, 500, "2026-03-25"),
      ligne("3", "c1", "Alpha", "F1", 300, 0, "2026-03-01"),
      ligne("4", "c1", "Alpha", "F1", 0, 300, "2026-03-05"),
      ligne("5", "c2", "Beta", "F3", 900, 0),
      ligne("6", "c2", "Beta", "F3", 0, 400),
    ];
    const lettres = calculerLettrage(l);
    expect(lettres.get("F1")).toBe("A");
    expect(lettres.get("F2")).toBe("B");
    expect(lettres.has("F3")).toBe(false); // solde 500 : pas lettré
  });

  test("grand livre auxiliaire : solde reporté, solde cumulé, lettrage sur tout l'historique", () => {
    const avant = [ligne("a", "c1", "Alpha", "F0", 1000, 0, "2025-12-01"), ligne("b", "c1", "Alpha", "F0", 0, 400, "2025-12-10")];
    const periode = [ligne("c", "c1", "Alpha", "F0", 0, 600, "2026-02-01"), ligne("d", "c1", "Alpha", "F1", 700, 0, "2026-02-05")];
    const gl = construireGrandLivreAuxiliaire(avant, periode);
    expect(gl).toHaveLength(1);
    expect(gl[0].soldeOuverture).toBe(600);
    expect(gl[0].lignes.map((x) => x.soldeCumule)).toEqual([0, 700]);
    expect(gl[0].lignes[0].lettre).toBe("A"); // F0 est soldée par un règlement de la période
    expect(gl[0].lignes[1].lettre).toBeNull();
    expect(gl[0]).toMatchObject({ totalDebit: 700, totalCredit: 600, soldeCloture: 700 });
  });

  test("tranches de retard", () => {
    const m = new Date("2026-11-02T00:00:00Z");
    const j = (n: number) => new Date(m.getTime() - n * 86_400_000);
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91, 400].map((n) => trancheDeRetard(j(n), m))).toEqual([
      "Non échu", "Non échu", "1 à 30 jours", "1 à 30 jours", "31 à 60 jours", "31 à 60 jours", "61 à 90 jours", "61 à 90 jours", "Plus de 90 jours", "Plus de 90 jours",
    ]);
  });

  test("balance âgée : totaux par tranche, tri par montant dû, restes nuls ignorés", () => {
    const m = new Date("2026-11-02T00:00:00Z");
    const j = (n: number) => new Date(m.getTime() - n * 86_400_000);
    const b = construireBalanceAgee(
      [
        { tiersId: "c1", tiersNom: "Alpha", numero: "F1", echeance: j(5), reste: 1000 },
        { tiersId: "c1", tiersNom: "Alpha", numero: "F2", echeance: j(-10), reste: 500 },
        { tiersId: "c2", tiersNom: "Beta", numero: "F3", echeance: j(120), reste: 4000 },
        { tiersId: "c3", tiersNom: "Gamma", numero: "F4", echeance: j(2), reste: 0 },
      ],
      m
    );
    expect(b.lignes.map((l) => l.nom)).toEqual(["Beta", "Alpha"]);
    expect(b.totaux).toEqual({ "Non échu": 500, "1 à 30 jours": 1000, "31 à 60 jours": 0, "61 à 90 jours": 0, "Plus de 90 jours": 4000 });
    expect(b.total).toBe(5500);
    expect(csvBalanceAgee(b, "CLIENT").lignes.at(-1)).toEqual(["TOTAL", "500", "1000", "0", "0", "4000", "5500"]);
    expect(csvGrandLivreAuxiliaire(construireGrandLivreAuxiliaire([], [ligne("z", "c1", "Alpha", "F1", 10, 0)]), "CLIENT").lignes[1].slice(4)).toEqual(["10", "0", "10", ""]);
  });
});

describe("Comptes de tiers — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Tiers A ${suffixe}`;
  const nomB = `TEST Tiers B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let alpha: string;
  let beta: string;
  let fournisseurId: string;
  let facA1: string;
  let facB1: string;
  const comptes: Record<string, string> = {};
  const periode = { du: dateDouala("2026-01-01", false)!, au: dateDouala("2026-12-31", true)! };

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `tiers-a-${suffixe}@vertexone.test`, nomComplet: "Admin Tiers A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    const rows = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "401000", "512000", "706000", "601000"]));
    for (const r of rows) comptes[r.numero] = r.id;
    const [c1] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Alpha Client", telephone: "+237600000011", assigneAId: uA }).returning({ id: contact.id }));
    const [c2] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Beta Client", telephone: "+237600000012", assigneAId: uA }).returning({ id: contact.id }));
    alpha = c1.id;
    beta = c2.id;
    const il = (jours: number) => new Date(Date.now() - jours * 86_400_000);
    const nouvelle = async (contactId: string, numero: string, ttc: number, echeance: Date, statut: "EMISE" | "PAYEE") => {
      const [f] = await avecEntreprise(A, (tx) =>
        tx.insert(facture).values({ entrepriseId: A, contactId, assigneAId: uA, numero, statut, montantHT: ttc, montantTVA: 0, montantTTC: ttc, dateEcheance: echeance, dateEmission: il(60) } as typeof facture.$inferInsert).returning({ id: facture.id })
      );
      return f.id;
    };
    // Alpha : F1 payée en entier (lettrée), F2 impayée en retard de 45 jours avec un acompte partiel de 400.
    facA1 = await nouvelle(alpha, `F-A1-${suffixe}`, 1000, il(40), "PAYEE");
    const facA2 = await nouvelle(alpha, `F-A2-${suffixe}`, 3000, il(45), "EMISE");
    // Beta : F3 impayée, non échue.
    const facB3 = await nouvelle(beta, `F-B3-${suffixe}`, 2000, new Date(Date.now() + 10 * 86_400_000), "EMISE");
    facB1 = facB3;
    const ec = (compte: string, debit: number, credit: number, date: string, factureId: string, libelle: string, extra: Record<string, string> = {}) => ({ entrepriseId: A, dateEcriture: new Date(date), libelle, compteId: comptes[compte], debit, credit, factureId, ...extra });
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        ec("411000", 1000, 0, "2026-03-01T10:00:00Z", facA1, "Facture A1"),
        ec("706000", 0, 1000, "2026-03-01T10:00:00Z", facA1, "Facture A1"),
        ec("512000", 1000, 0, "2026-03-15T10:00:00Z", facA1, "Règlement A1", { paiementId: "p-a1" }),
        ec("411000", 0, 1000, "2026-03-15T10:00:00Z", facA1, "Règlement A1", { paiementId: "p-a1" }),
        ec("411000", 3000, 0, "2026-04-01T10:00:00Z", facA2, "Facture A2"),
        ec("706000", 0, 3000, "2026-04-01T10:00:00Z", facA2, "Facture A2"),
        ec("512000", 400, 0, "2026-04-10T10:00:00Z", facA2, "Règlement partiel A2", { paiementId: "p-a2" }),
        ec("411000", 0, 400, "2026-04-10T10:00:00Z", facA2, "Règlement partiel A2", { paiementId: "p-a2" }),
        ec("411000", 2000, 0, "2026-05-01T10:00:00Z", facB3, "Facture B3"),
        ec("706000", 0, 2000, "2026-05-01T10:00:00Z", facB3, "Facture B3"),
      ])
    );
    await avecEntreprise(A, (tx) => tx.insert(paiement).values([{ entrepriseId: A, factureId: facA1, montant: 1000, moyenPaiement: "manuel", datePaiement: new Date() }, { entrepriseId: A, factureId: facA2, montant: 400, moyenPaiement: "manuel", datePaiement: new Date() }]));
    // Avoir de 600 sur A2 : le reste dû devient 3000 − 400 − 600 = 2000.
    await avecEntreprise(A, (tx) => tx.insert(avoirClient).values({ entrepriseId: A, factureId: facA2, numero: `AV-T-${suffixe}`, motif: "Geste commercial", montantHT: 600, montantTVA: 0, montantTTC: 600, creeParId: uA }));

    // Fournisseur : une facture de 5 000 payée à 2 000, échéance dépassée de 100 jours.
    const [f1] = await avecEntreprise(A, (tx) => tx.insert(fournisseur).values({ entrepriseId: A, nom: "Fournisseur Test", telephone: "+237600000013" }).returning({ id: fournisseur.id }));
    fournisseurId = f1.id;
    const [ff] = await avecEntreprise(A, (tx) =>
      tx.insert(factureFournisseur).values({ entrepriseId: A, numero: `FF-T-${suffixe}`, fournisseurId, compteComptableId: comptes["601000"], dateFacture: il(130), dateEcheance: il(100), montantHT: 5000, montantTVA: 0, montantTTC: 5000, assigneAId: uA, creeParId: uA } as typeof factureFournisseur.$inferInsert).returning({ id: factureFournisseur.id })
    );
    await avecEntreprise(A, (tx) => tx.insert(paiementEffectue).values({ entrepriseId: A, factureFournisseurId: ff.id, montant: 2000, moyenPaiement: "manuel", datePaiement: new Date(), creeParId: uA }));
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        { entrepriseId: A, dateEcriture: new Date("2026-02-01T10:00:00Z"), libelle: "Facture fournisseur", compteId: comptes["601000"], debit: 5000, credit: 0, factureFournisseurId: ff.id },
        { entrepriseId: A, dateEcriture: new Date("2026-02-01T10:00:00Z"), libelle: "Facture fournisseur", compteId: comptes["401000"], debit: 0, credit: 5000, factureFournisseurId: ff.id },
        { entrepriseId: A, dateEcriture: new Date("2026-03-01T10:00:00Z"), libelle: "Paiement fournisseur", compteId: comptes["401000"], debit: 2000, credit: 0, factureFournisseurId: ff.id, paiementEffectueId: "pe-t" },
        { entrepriseId: A, dateEcriture: new Date("2026-03-01T10:00:00Z"), libelle: "Paiement fournisseur", compteId: comptes["512000"], debit: 0, credit: 2000, factureFournisseurId: ff.id, paiementEffectueId: "pe-t" },
      ])
    );
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("grand livre auxiliaire clients : un compte par client, soldes, lettrage de la facture soldée seulement", async () => {
    const gl = await avecEntreprise(A, (tx) => lireGrandLivreAuxiliaire(tx, A, "CLIENT", periode));
    expect(gl.map((t) => t.nom)).toEqual(["Alpha Client", "Beta Client"]);
    const a = gl[0];
    expect(a.soldeCloture).toBe(2600); // 1000−1000 + 3000−400
    const lettrees = a.lignes.filter((l) => l.lettre);
    expect(lettrees).toHaveLength(2);
    expect(new Set(lettrees.map((l) => l.lettre))).toEqual(new Set(["A"]));
    expect(a.lignes.filter((l) => !l.lettre).map((l) => l.libelle)).toEqual(["Facture A2", "Règlement partiel A2"]);
    expect(gl[1].soldeCloture).toBe(2000);
    // Un seul client demandé.
    const un = await avecEntreprise(A, (tx) => lireGrandLivreAuxiliaire(tx, A, "CLIENT", periode, beta));
    expect(un.map((t) => t.nom)).toEqual(["Beta Client"]);
    expect((await avecEntreprise(A, (tx) => listerTiersAvecEcritures(tx, A, "CLIENT"))).map((t) => t.nom)).toEqual(["Alpha Client", "Beta Client"]);
  });

  test("grand livre auxiliaire fournisseurs", async () => {
    const gl = await avecEntreprise(A, (tx) => lireGrandLivreAuxiliaire(tx, A, "FOURNISSEUR", periode));
    expect(gl).toHaveLength(1);
    expect(gl[0]).toMatchObject({ nom: "Fournisseur Test", totalDebit: 2000, totalCredit: 5000, soldeCloture: -3000 });
  });

  test("balance âgée clients : nette des règlements ET des avoirs, factures payées exclues", async () => {
    const b = await avecEntreprise(A, (tx) => lireBalanceAgee(tx, A, "CLIENT"));
    expect(b.lignes.map((l) => l.nom)).toEqual(["Alpha Client", "Beta Client"]);
    expect(b.lignes[0].total).toBe(2000); // 3000 − 400 − 600
    expect(b.lignes[0].tranches["31 à 60 jours"]).toBe(2000);
    expect(b.lignes[1].tranches["Non échu"]).toBe(2000);
    expect(b.total).toBe(4000);
  });

  test("balance âgée fournisseurs", async () => {
    const b = await avecEntreprise(A, (tx) => lireBalanceAgee(tx, A, "FOURNISSEUR"));
    expect(b.lignes).toHaveLength(1);
    expect(b.lignes[0]).toMatchObject({ nom: "Fournisseur Test", total: 3000 });
    expect(b.lignes[0].tranches["61 à 90 jours"] + b.lignes[0].tranches["Plus de 90 jours"]).toBe(3000);
  });

  test("fuite entre entreprises : B ne voit aucun tiers ni aucune créance de A", async () => {
    expect(await avecEntreprise(B, (tx) => lireGrandLivreAuxiliaire(tx, B, "CLIENT", periode))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => lireGrandLivreAuxiliaire(tx, A, "CLIENT", periode))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => lireGrandLivreAuxiliaire(tx, B, "FOURNISSEUR", periode, fournisseurId))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => lireBalanceAgee(tx, B, "CLIENT"))).lignes).toEqual([]);
    expect((await avecEntreprise(B, (tx) => lireBalanceAgee(tx, A, "CLIENT"))).lignes).toEqual([]);
    expect(await avecEntreprise(B, (tx) => listerTiersAvecEcritures(tx, B, "CLIENT"))).toEqual([]);
    expect(facA1 && facB1).toBeTruthy();
  });
});
