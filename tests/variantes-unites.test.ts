import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, mouvementStock, produit, utilisateur } from "@/db/schema";
import { combinerOptions, conditionnementValide, decomposerStock, lireValeurs, nomVariante, versUniteBase } from "@/lib/produits/variantes-regles";
import { ajouterConditionnement, ajouterVariantes, creerFamille, definirUnite, lireConditionnements, lireFamille, listerFamilles, retirerConditionnement } from "@/lib/produits/variantes";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.5 : variantes (taille, couleur…) et unités de mesure (carton, pièce). */
describe("Variantes et conditionnements — règles pures", () => {
  test("lire les valeurs : virgules et points-virgules, espaces nettoyés, doublons écartés", () => {
    expect(lireValeurs("S, M ; L,  M ,, xl")).toEqual(["S", "M", "L", "xl"]);
    expect(lireValeurs("Rouge,rouge,ROUGE")).toEqual(["Rouge"]);
    expect(lireValeurs("")).toEqual([]);
  });

  test("combinaisons : produit cartésien dans l'ordre des options ; options vides ignorées", () => {
    const r = combinerOptions([{ nom: "Taille", valeurs: ["S", "M"] }, { nom: "Couleur", valeurs: ["Rouge", "Bleu"] }, { nom: "", valeurs: [] }]);
    expect(r).toEqual({ ok: true, libelles: ["S / Rouge", "S / Bleu", "M / Rouge", "M / Bleu"] });
    expect(combinerOptions([{ nom: "Taille", valeurs: ["S"] }])).toEqual({ ok: true, libelles: ["S"] });
    expect(nomVariante("  Tee-shirt  ", "M / Rouge")).toBe("Tee-shirt — M / Rouge");
  });

  test("limites : aucune option, trop de valeurs, trop de variantes", () => {
    expect(combinerOptions([]).ok).toBe(false);
    expect(combinerOptions([{ nom: "A", valeurs: [] }]).ok).toBe(false);
    const vingtEtUne = Array.from({ length: 21 }, (_, i) => `v${i}`);
    expect(combinerOptions([{ nom: "A", valeurs: vingtEtUne }]).ok).toBe(false);
    const dix = Array.from({ length: 10 }, (_, i) => `v${i}`);
    expect(combinerOptions([{ nom: "A", valeurs: dix }, { nom: "B", valeurs: dix }]).ok).toBe(true); // 100
    expect(combinerOptions([{ nom: "A", valeurs: dix }, { nom: "B", valeurs: dix }, { nom: "C", valeurs: ["x", "y"] }]).ok).toBe(false); // 200
    expect(combinerOptions([{ nom: "1", valeurs: ["a"] }, { nom: "2", valeurs: ["a"] }, { nom: "3", valeurs: ["a"] }, { nom: "4", valeurs: ["a"] }]).ok).toBe(false);
  });

  test("décomposition du stock en conditionnements, du plus grand au plus petit", () => {
    const c = [{ nom: "Carton", quantiteBase: 12 }, { nom: "Palette", quantiteBase: 144 }];
    expect(decomposerStock(27, c)).toEqual({ parts: [{ nom: "Carton", nombre: 2 }], reste: 3 });
    expect(decomposerStock(300, c)).toEqual({ parts: [{ nom: "Palette", nombre: 2 }, { nom: "Carton", nombre: 1 }], reste: 0 });
    expect(decomposerStock(5, c)).toEqual({ parts: [], reste: 5 });
    expect(decomposerStock(0, c)).toEqual({ parts: [], reste: 0 });
    expect(decomposerStock(-4, c)).toEqual({ parts: [], reste: 0 });
    expect(decomposerStock(27, [])).toEqual({ parts: [], reste: 27 });
  });

  test("conversion de saisie et validation d'un conditionnement", () => {
    expect(versUniteBase(3, 12)).toBe(36);
    expect(versUniteBase(3, 1)).toBe(3);
    expect(versUniteBase(Number.NaN, 12)).toBeNull();
    expect(versUniteBase(3, 0)).toBeNull();
    expect(conditionnementValide("Carton", 12)).toBeNull();
    expect(conditionnementValide("C", 12)).not.toBeNull();
    expect(conditionnementValide("Carton", 1)).not.toBeNull();
    expect(conditionnementValide("Carton", 2.5)).not.toBeNull();
  });
});

describe("Variantes et conditionnements — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Variantes A ${suffixe}`;
  const nomB = `TEST Variantes B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let famille = "";
  let premier = "";
  const options = [{ nom: "Taille", valeurs: ["S", "M"] }, { nom: "Couleur", valeurs: ["Rouge", "Bleu"] }];
  const reglages = { prixVente: 5000, prixAchat: 2000, suiviStock: true, stockInitial: 10 };

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `var-a-${suffixe}@vertexone.test`, nomComplet: "Admin Var A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: B, email: `var-b-${suffixe}@vertexone.test`, nomComplet: "Admin Var B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    uB = y.id;
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  test("créer une famille : un produit par combinaison, avec son stock de départ et son historique", async () => {
    const r = await avecEntreprise(A, (tx) => creerFamille(tx, A, uA, { nom: "Tee-shirt", options, ...reglages }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    famille = r.familleId;
    expect(r.crees).toBe(4);

    const vue = await avecEntreprise(A, (tx) => lireFamille(tx, A, famille));
    expect(vue!.nom).toBe("Tee-shirt");
    expect(vue!.variantes.map((v) => v.variante).sort()).toEqual(["M / Bleu", "M / Rouge", "S / Bleu", "S / Rouge"]);
    expect(vue!.variantes.every((v) => v.nom.startsWith("Tee-shirt — ") && v.prixVente === 5000 && v.suiviStock && v.stockActuel === 10)).toBe(true);
    premier = vue!.variantes[0].id;

    const histo = await avecEntreprise(A, (tx) => tx.select({ type: mouvementStock.type, quantite: mouvementStock.quantite }).from(mouvementStock).where(eq(mouvementStock.produitId, premier)));
    expect(histo).toEqual([{ type: "INITIAL", quantite: 10 }]);
    const [p] = await avecEntreprise(A, (tx) => tx.select({ type: produit.type, cout: produit.coutMoyen }).from(produit).where(eq(produit.id, premier)));
    expect(p).toEqual({ type: "BIEN", cout: 2000 });
  }, 180_000);

  test("ajouter des variantes : les combinaisons déjà présentes sont ignorées, rien n'est dupliqué", async () => {
    const r = await avecEntreprise(A, (tx) => ajouterVariantes(tx, A, uA, famille, [{ nom: "Taille", valeurs: ["S", "L"] }, { nom: "Couleur", valeurs: ["Rouge"] }], { ...reglages, stockInitial: 0 }));
    expect(r).toMatchObject({ ok: true, crees: 1, ignores: 1 }); // seul « L / Rouge » est nouveau
    expect((await avecEntreprise(A, (tx) => lireFamille(tx, A, famille)))!.variantes).toHaveLength(5);
    const encore = await avecEntreprise(A, (tx) => ajouterVariantes(tx, A, uA, famille, [{ nom: "Taille", valeurs: ["S"] }, { nom: "Couleur", valeurs: ["rouge"] }], reglages));
    expect(encore.ok).toBe(false);
    const liste = await avecEntreprise(A, (tx) => listerFamilles(tx, A));
    expect(liste).toEqual([expect.objectContaining({ nom: "Tee-shirt", variantes: 5, stock: 40 })]);
  }, 180_000);

  test("refus : nom trop court, aucune option, prix négatif, stock décimal, famille inconnue", async () => {
    const essai = (f: Partial<Parameters<typeof creerFamille>[3]>) => avecEntreprise(A, (tx) => creerFamille(tx, A, uA, { nom: "Casquette", options, ...reglages, ...f }));
    expect((await essai({ nom: "C" })).ok).toBe(false);
    expect((await essai({ options: [] })).ok).toBe(false);
    expect((await essai({ prixVente: -1 })).ok).toBe(false);
    expect((await essai({ stockInitial: 1.5 })).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => ajouterVariantes(tx, A, uA, "inconnue", options, reglages))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => listerFamilles(tx, A))).length).toBe(1); // aucun refus n'a laissé de famille vide
  }, 180_000);

  test("unité et conditionnements : validation, doublon, limite de cinq, retrait, décomposition de lecture", async () => {
    expect((await avecEntreprise(A, (tx) => definirUnite(tx, A, premier, "pièce"))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => definirUnite(tx, A, premier, "x".repeat(21)))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => tx.select({ u: produit.unite }).from(produit).where(eq(produit.id, premier))))[0].u).toBe("pièce");
    expect((await avecEntreprise(A, (tx) => definirUnite(tx, A, premier, null))).ok).toBe(true);

    const ajouter = (nom: string, q: number) => avecEntreprise(A, (tx) => ajouterConditionnement(tx, A, premier, nom, q));
    expect((await ajouter("Carton", 12)).ok).toBe(true);
    expect((await ajouter("carton", 24)).ok).toBe(false); // même nom, casse ignorée
    expect((await ajouter("Lot", 1)).ok).toBe(false);
    expect((await ajouter("Palette", 144)).ok).toBe(true);
    expect((await ajouter("Caisse", 6)).ok).toBe(true);
    expect((await ajouter("Sachet", 3)).ok).toBe(true);
    expect((await ajouter("Fardeau", 4)).ok).toBe(true);
    expect((await ajouter("Sixième", 5)).ok).toBe(false); // cinq au plus

    const liste = await avecEntreprise(A, (tx) => lireConditionnements(tx, A, premier));
    expect(liste.map((c) => [c.nom, c.quantiteBase])).toEqual([["Sachet", 3], ["Fardeau", 4], ["Caisse", 6], ["Carton", 12], ["Palette", 144]]);
    const carton = liste.find((c) => c.nom === "Carton")!;
    expect((await avecEntreprise(A, (tx) => retirerConditionnement(tx, A, carton.id))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => retirerConditionnement(tx, A, carton.id))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => lireConditionnements(tx, A, premier))).length).toBe(4);
    // Le stock reste compté en unités de base : conditionner ne le change jamais.
    expect((await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(and(eq(produit.id, premier), eq(produit.entrepriseId, A)))))[0].s).toBe(10);
  }, 240_000);

  test("fuite entre entreprises : B ne voit ni ne modifie la famille, les produits ou les conditionnements de A", async () => {
    const [cond] = await avecEntreprise(A, (tx) => lireConditionnements(tx, A, premier));
    expect(await avecEntreprise(B, (tx) => lireFamille(tx, B, famille))).toBeNull();
    expect(await avecEntreprise(B, (tx) => listerFamilles(tx, B))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => ajouterVariantes(tx, B, uB, famille, options, reglages))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => definirUnite(tx, B, premier, "kg"))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => ajouterConditionnement(tx, B, premier, "Carton", 12))).ok).toBe(false);
    expect((await avecEntreprise(B, (tx) => retirerConditionnement(tx, B, cond.id))).ok).toBe(false);
    expect(await avecEntreprise(B, (tx) => lireConditionnements(tx, B, premier))).toEqual([]);
    expect((await avecEntreprise(A, (tx) => lireConditionnements(tx, A, premier))).some((c) => c.id === cond.id)).toBe(true);
  }, 180_000);
});
