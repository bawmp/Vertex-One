import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { creerImmobilisation, lireRegistre, passerDotationsExercice, supprimerImmobilisation } from "@/lib/comptabilite/immobilisations";
import { planAmortissement } from "@/lib/comptabilite/immobilisations-regles";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { dateDouala } from "@/lib/comptabilite/livres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 2.5 : registre des immobilisations et dotations annuelles aux amortissements. */
describe("Immobilisations — plan d'amortissement (règles pures)", () => {
  test("linéaire, prorata au mois : la somme des dotations vaut exactement la base amortissable", () => {
    const plan = planAmortissement({ valeurAcquisition: 1_000_000, valeurResiduelle: 100_000, dureeAnnees: 5, anneeAcquisition: 2024, moisAcquisition: 7 });
    expect(plan.reduce((s, d) => s + d.montant, 0)).toBe(900_000);
    expect(plan[0]).toEqual({ annee: 2024, montant: 90_000 }); // 6 mois sur 60 : 900 000 × 6/60
    expect(plan[1].montant).toBe(180_000);
    expect(plan[plan.length - 1].annee).toBe(2029);
    expect(plan).toHaveLength(6);
  });

  test("acquisition en janvier : année pleine dès la première ; montants non divisibles restent entiers et exacts", () => {
    const plan = planAmortissement({ valeurAcquisition: 100_000, valeurResiduelle: 0, dureeAnnees: 3, anneeAcquisition: 2025, moisAcquisition: 1 });
    expect(plan.map((d) => d.annee)).toEqual([2025, 2026, 2027]);
    expect(plan.reduce((s, d) => s + d.montant, 0)).toBe(100_000);
    expect(plan.every((d) => Number.isInteger(d.montant))).toBe(true);
  });

  test("données invalides : aucun plan", () => {
    const base = { valeurAcquisition: 1000, valeurResiduelle: 0, dureeAnnees: 3, anneeAcquisition: 2025, moisAcquisition: 1 };
    expect(planAmortissement({ ...base, valeurAcquisition: 0 })).toEqual([]);
    expect(planAmortissement({ ...base, valeurResiduelle: 1000 })).toEqual([]);
    expect(planAmortissement({ ...base, dureeAnnees: 0 })).toEqual([]);
    expect(planAmortissement({ ...base, dureeAnnees: 51 })).toEqual([]);
    expect(planAmortissement({ ...base, moisAcquisition: 13 })).toEqual([]);
  });
});

describe("Immobilisations — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Immo A ${suffixe}`;
  const nomB = `TEST Immo B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  const maintenant = new Date("2026-11-02T10:00:00Z");
  let idOrdi = "";

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `immo-a-${suffixe}@vertexone.test`, nomComplet: "Admin Immo A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const ajouter = (p: Partial<Parameters<typeof creerImmobilisation>[3]> = {}) =>
    avecEntreprise(A, (tx) =>
      creerImmobilisation(tx, A, uA, { libelle: "Ordinateur", compteActif: "244100", dateAcquisition: dateDouala("2025-03-10", false)!, valeurAcquisition: 600_000, valeurResiduelle: 0, dureeAnnees: 3, contrepartieAcquisition: "512000", ...p }, maintenant)
    );

  test("ajout avec écriture d'acquisition, puis dotations 2025 : écritures équilibrées, registre à jour", async () => {
    expect((await ajouter()).ok).toBe(true);
    const registre = await avecEntreprise(A, (tx) => lireRegistre(tx));
    expect(registre).toHaveLength(1);
    idOrdi = registre[0].id;
    expect(registre[0].valeurNette).toBe(600_000);

    const fin2025 = dateDouala("2025-12-31", true)!;
    const avant = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin2025));
    expect(avant.find((l) => l.numero === "244100")?.solde).toBe(600_000);
    expect(avant.find((l) => l.numero === "512000")?.solde).toBe(-600_000);

    const r = await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 2025, maintenant));
    expect(r.ok && r.nombre).toBe(1);
    // 600 000 / 36 mois × 10 mois (mars à décembre)
    const attendu = Math.round((600_000 * 10) / 36);
    expect(r.ok && r.total).toBe(attendu);
    const apres = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin2025));
    expect(apres.find((l) => l.numero === "681000")?.solde).toBe(attendu);
    expect(apres.find((l) => l.numero === "284100")?.solde).toBe(-attendu);
    expect(apres.reduce((s, l) => s + l.solde, 0)).toBe(0);

    const registre2 = await avecEntreprise(A, (tx) => lireRegistre(tx));
    expect(registre2[0].amortissementsCumules).toBe(attendu);
    expect(registre2[0].valeurNette).toBe(600_000 - attendu);
    expect(registre2[0].anneesPassees).toEqual([2025]);
  }, 120_000);

  test("rejouer l'exercice ne passe rien de plus ; un bien ajouté ensuite est seul traité", async () => {
    const rejeu = await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 2025, maintenant));
    expect(rejeu).toMatchObject({ ok: true, numero: null, nombre: 0, total: 0 });
    expect((await ajouter({ libelle: "Bureau", compteActif: "244000", valeurAcquisition: 120_000, dureeAnnees: 10, contrepartieAcquisition: null })).ok).toBe(true);
    const suite = await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 2025, maintenant));
    expect(suite.ok && suite.nombre).toBe(1);
    const fin2025 = dateDouala("2025-12-31", true)!;
    const bal = await avecEntreprise(A, (tx) => calculerBalance(tx, A, fin2025));
    expect(bal.find((l) => l.numero === "284000")?.solde).toBe(-Math.round((120_000 * 10) / 120));
    expect(bal.find((l) => l.numero === "244000")).toBeUndefined(); // acquisition déjà enregistrée ailleurs : pas d'écriture ici
  }, 120_000);

  test("retrait : refusé pour un bien déjà amorti, accepté pour un bien sans dotation", async () => {
    expect((await avecEntreprise(A, (tx) => supprimerImmobilisation(tx, idOrdi))).ok).toBe(false);
    expect((await ajouter({ libelle: "Brouillon", contrepartieAcquisition: null, dateAcquisition: dateDouala("2026-06-01", false)! })).ok).toBe(true);
    const brouillon = (await avecEntreprise(A, (tx) => lireRegistre(tx))).find((b) => b.libelle === "Brouillon")!;
    expect((await avecEntreprise(A, (tx) => supprimerImmobilisation(tx, brouillon.id))).ok).toBe(true);
  }, 120_000);

  test("refus : catégorie inconnue, valeurs invalides, date future, exercice futur ou invalide, période verrouillée", async () => {
    expect((await ajouter({ compteActif: "601000" })).ok).toBe(false);
    expect((await ajouter({ valeurAcquisition: 0 })).ok).toBe(false);
    expect((await ajouter({ valeurResiduelle: 600_000 })).ok).toBe(false);
    expect((await ajouter({ dureeAnnees: 0 })).ok).toBe(false);
    expect((await ajouter({ dateAcquisition: dateDouala("2027-01-01", false)! })).ok).toBe(false);
    expect((await ajouter({ contrepartieAcquisition: "601000" })).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 2027, maintenant))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 1999, maintenant))).ok).toBe(false);

    await db.update(entreprise).set({ dateVerrouillageComptable: dateDouala("2026-12-31", true)! }).where(eq(entreprise.id, A));
    expect((await avecEntreprise(A, (tx) => passerDotationsExercice(tx, A, uA, 2026, maintenant))).ok).toBe(false);
    expect((await ajouter({ dateAcquisition: dateDouala("2026-02-01", false)! })).ok).toBe(false);
    await db.update(entreprise).set({ dateVerrouillageComptable: null }).where(eq(entreprise.id, A));
  }, 120_000);

  test("fuite entre entreprises : B ne voit aucun bien de A, ne peut pas le retirer, et ses dotations ne touchent pas A", async () => {
    expect(await avecEntreprise(B, (tx) => lireRegistre(tx))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => supprimerImmobilisation(tx, idOrdi))).toMatchObject({ ok: false });
    const r = await avecEntreprise(B, (tx) => passerDotationsExercice(tx, B, uA, 2025, maintenant));
    expect(r).toMatchObject({ ok: true, nombre: 0 });
    expect((await avecEntreprise(A, (tx) => lireRegistre(tx))).length).toBeGreaterThan(0);
  }, 120_000);
});
