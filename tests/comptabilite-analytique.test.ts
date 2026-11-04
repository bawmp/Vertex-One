import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { db, avecEntreprise } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";
import { compteComptable, contact, entreprise, facture, utilisateur } from "@/db/schema";
import { codeValide, normaliserCode, nettoyerLibelle, resultatParSection } from "@/lib/comptabilite/analytique-regles";
import { affecterDocument, creerSection, definirSectionContact, lireResultatAnalytique, listerSections, modifierSection } from "@/lib/comptabilite/analytique";
import { genererEcrituresDepense, genererEcrituresFactureEmise, genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 4.5 : comptabilité analytique — résultat par section, rattachement d'un document, règlements qui suivent. */
describe("Comptabilité analytique — règles pures", () => {
  test("code : normalisé en majuscules, 2 à 20 caractères", () => {
    expect(normaliserCode(" proj 1 ")).toBe("PROJ-1");
    expect(codeValide("PROJ-1")).toBe(true);
    expect(codeValide("A")).toBe(false);
    expect(codeValide("A".repeat(21))).toBe(false);
    expect(codeValide("-AB")).toBe(false);
    expect(codeValide("A B")).toBe(false);
    expect(nettoyerLibelle("  Agence   Douala ")).toBe("Agence Douala");
  });

  test("résultat par section : produits, charges, non affecté ; la somme retrouve le résultat global", () => {
    const r = resultatParSection([
      { section: "s1", classe: 7, debit: 0, credit: 1000 },
      { section: "s1", classe: 6, debit: 300, credit: 0 },
      { section: null, classe: 7, debit: 0, credit: 500 },
      { section: "s2", classe: 6, debit: 200, credit: 0 },
      { section: "s2", classe: 4, debit: 999, credit: 0 },
    ]);
    expect(r.find((x) => x.section === "s1")).toMatchObject({ produits: 1000, charges: 300, resultat: 700 });
    expect(r.find((x) => x.section === "s2")).toMatchObject({ produits: 0, charges: 200, resultat: -200 });
    expect(r.at(-1)?.section).toBeNull();
    expect(r.reduce((s, x) => s + x.resultat, 0)).toBe(1000 - 300 + 500 - 200);
  });
});

describe("Comptabilité analytique — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Analytique A ${suffixe}`;
  const nomB = `TEST Analytique B ${suffixe}`;
  let A: string;
  let B: string;
  const periode = { du: new Date("2026-01-01T00:00:00+01:00"), au: new Date("2026-12-31T23:59:59+01:00") };
  const date = new Date("2026-05-10T10:00:00+01:00");

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 60_000);

  test("créer une section : code unique, axe connu, nom obligatoire", async () => {
    const ok = await avecEntreprise(A, (tx) => creerSection(tx, A, { axe: "PROJET", code: "chantier 1", libelle: "Chantier Bonanjo" }));
    expect(ok.ok).toBe(true);
    const doublon = await avecEntreprise(A, (tx) => creerSection(tx, A, { axe: "AGENCE", code: "CHANTIER-1", libelle: "Autre" }));
    expect(doublon.ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerSection(tx, A, { axe: "XX", code: "ZZ1", libelle: "x" }))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerSection(tx, A, { axe: "AUTRE", code: "ZZ2", libelle: "  " }))).ok).toBe(false);
    // Le même code reste libre dans une autre entreprise.
    expect((await avecEntreprise(B, (tx) => creerSection(tx, B, { axe: "PROJET", code: "CHANTIER-1", libelle: "Chez B" }))).ok).toBe(true);
  }, 60_000);

  test("rattacher une facture : ses écritures, puis son règlement, suivent la section ; résultat par section", async () => {
    const [s] = await avecEntreprise(A, (tx) => listerSections(tx, A));
    await avecEntreprise(A, (tx) => genererEcrituresFactureEmise(tx, { id: "fac-test-1", entrepriseId: A, numero: "FAC-T1", dateEmission: date, montantHT: 10_000, montantTVA: 0, montantTTC: 10_000 }));
    const r = await avecEntreprise(A, (tx) => affecterDocument(tx, A, "FACTURE", "fac-test-1", s.id));
    expect(r).toMatchObject({ ok: true, lignes: 2 });
    // Règlement enregistré APRÈS le rattachement : il suit la section de sa facture.
    await avecEntreprise(A, (tx) => genererEcrituresPaiement(tx, { entrepriseId: A, factureId: "fac-test-1", paiementId: "pay-test-1", numeroFacture: "FAC-T1", montant: 10_000, moyenPaiement: "manuel", datePaiement: date }));
    // Une dépense non affectée.
    await avecEntreprise(A, async (tx) => {
      const [c] = await tx.select({ id: compteComptable.id }).from(compteComptable).where(and(eq(compteComptable.numero, "601000"), isNull(compteComptable.entrepriseId)));
      await genererEcrituresDepense(tx, { id: "dep-test-1", entrepriseId: A, libelle: "Achat", compteComptableId: c.id, montantHT: 2_000, montantTVA: 0, montantTTC: 2_000, moyenPaiement: "manuel", datePaiement: date });
    });
    const res = await avecEntreprise(A, (tx) => lireResultatAnalytique(tx, A, periode));
    const ligne = res.lignes.find((l) => l.section === s.id)!;
    expect(ligne).toMatchObject({ code: "CHANTIER-1", produits: 10_000, charges: 0, resultat: 10_000 });
    expect(res.lignes.find((l) => l.section === null)).toMatchObject({ charges: 2_000 });
    expect(res.totalProduits - res.totalCharges).toBe(8_000);
    const sections = await avecEntreprise(A, (tx) => listerSections(tx, A));
    expect(sections[0].nbEcritures).toBe(4); // 2 de la facture + 2 du règlement
  }, 90_000);

  test("détacher, désactiver : une section désactivée ne reçoit plus de document", async () => {
    const [s] = await avecEntreprise(A, (tx) => listerSections(tx, A));
    expect(await avecEntreprise(A, (tx) => affecterDocument(tx, A, "FACTURE", "fac-test-1", null))).toMatchObject({ ok: true, lignes: 4 });
    expect((await avecEntreprise(A, (tx) => modifierSection(tx, A, s.id, { libelle: "Chantier", actif: false }))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => affecterDocument(tx, A, "FACTURE", "fac-test-1", s.id))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => affecterDocument(tx, A, "BIDON", "x", null))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => affecterDocument(tx, A, "FACTURE", "inexistante", null))).ok).toBe(false);
  }, 60_000);

  test("fuite : une autre entreprise ne voit ni ne modifie les sections et écritures de la première", async () => {
    const [sA] = await avecEntreprise(A, (tx) => listerSections(tx, A));
    const vuParB = await avecEntreprise(B, (tx) => listerSections(tx, B));
    expect(vuParB.map((x) => x.libelle)).toEqual(["Chez B"]);
    // B ne peut ni rattacher à la section de A, ni toucher les écritures de A.
    expect((await avecEntreprise(B, (tx) => affecterDocument(tx, B, "FACTURE", "fac-test-1", sA.id))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => modifierSection(tx, B, sA.id, { libelle: "Piraté", actif: true }))).ok).toBe(false);
    const res = await avecEntreprise(B, (tx) => lireResultatAnalytique(tx, B, periode));
    expect(res.totalProduits).toBe(0);
    expect((await avecEntreprise(A, (tx) => listerSections(tx, A)))[0].libelle).toBe("Chantier");
  }, 60_000);

  test("section par défaut d'un client : ses nouvelles factures y sont rattachées ; section désactivée ou autre entreprise refusées", async () => {
    const [sA] = await avecEntreprise(A, (tx) => listerSections(tx, A));
    const [uA] = await db.insert(utilisateur).values({ entrepriseId: A, email: `an-a-${suffixe}@vertexone.test`, nomComplet: "Admin AN A", role: "ADMIN" }).returning({ id: utilisateur.id });
    // La section de A a été désactivée plus haut : on la réactive pour ce test.
    await avecEntreprise(A, (tx) => modifierSection(tx, A, sA.id, { libelle: "Chantier", actif: true }));
    const [c] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Client Section", telephone: "690111333", assigneAId: uA.id }).returning({ id: contact.id }));
    expect((await avecEntreprise(A, (tx) => definirSectionContact(tx, A, c.id, sA.id))).ok).toBe(true);
    const [f] = await avecEntreprise(A, (tx) => tx.insert(facture).values({ entrepriseId: A, numero: `FAC-AN-${suffixe}`, contactId: c.id, assigneAId: uA.id, montantHT: 5_000, montantTVA: 0, montantTTC: 5_000, dateEcheance: date }).returning({ id: facture.id }));
    await avecEntreprise(A, (tx) => genererEcrituresFactureEmise(tx, { id: f.id, entrepriseId: A, numero: `FAC-AN-${suffixe}`, dateEmission: date, montantHT: 5_000, montantTVA: 0, montantTTC: 5_000 }));
    const res = await avecEntreprise(A, (tx) => lireResultatAnalytique(tx, A, periode));
    expect(res.lignes.find((l) => l.section === sA.id)?.produits).toBe(5_000);
    // Un règlement ultérieur suit, et retirer la section du client ne déplace pas les écritures déjà passées.
    expect((await avecEntreprise(A, (tx) => definirSectionContact(tx, A, c.id, null))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => lireResultatAnalytique(tx, A, periode))).lignes.find((l) => l.section === sA.id)?.produits).toBe(5_000);
    // Section désactivée refusée ; section d'une autre entreprise refusée.
    await avecEntreprise(A, (tx) => modifierSection(tx, A, sA.id, { libelle: "Chantier", actif: false }));
    expect((await avecEntreprise(A, (tx) => definirSectionContact(tx, A, c.id, sA.id))).ok).toBe(false);
    const [sB] = await avecEntreprise(B, (tx) => listerSections(tx, B));
    expect((await avecEntreprise(A, (tx) => definirSectionContact(tx, A, c.id, sB.id))).ok).toBe(false);
    // L'autre entreprise ne peut pas poser une section sur le contact de A.
    expect((await avecEntreprise(B, (tx) => definirSectionContact(tx, B, c.id, sB.id))).ok).toBe(false);
  }, 120_000);
});
