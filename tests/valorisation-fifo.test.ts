import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, mouvementStock, produit, utilisateur } from "@/db/schema";
import { methodeValide, valeurFIFO } from "@/lib/produits/valorisation-regles";
import { methodeDe, lireValorisation } from "@/lib/produits/valorisation";
import { decrementerStockVente, incrementerStockAchat } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.8 : valorisation « premier entré, premier sorti » en option, à côté du coût moyen pondéré. */
describe("Valorisation FIFO — règles pures", () => {
  test("le stock restant se prend dans les couches les plus récentes", () => {
    const couches = [{ quantite: 10, cout: 100 }, { quantite: 10, cout: 200 }, { quantite: 10, cout: 300 }];
    expect(valeurFIFO(30, couches, 0)).toBe(6000);
    expect(valeurFIFO(10, couches, 0)).toBe(3000); // la dernière couche seule
    expect(valeurFIFO(15, couches, 0)).toBe(10 * 300 + 5 * 200);
    expect(valeurFIFO(0, couches, 0)).toBe(0);
    expect(valeurFIFO(-4, couches, 0)).toBe(0);
  });

  test("historique plus court que le stock : le surplus ancien vaut la plus ancienne couche connue, à défaut le coût de repli", () => {
    expect(valeurFIFO(25, [{ quantite: 10, cout: 100 }, { quantite: 10, cout: 200 }], 999)).toBe(10 * 200 + 10 * 100 + 5 * 100);
    expect(valeurFIFO(5, [], 700)).toBe(3500);
  });

  test("méthode : seules les deux valeurs connues sont acceptées", () => {
    expect(methodeValide("FIFO")).toBe("FIFO");
    expect(methodeValide("CMUP")).toBe("CMUP");
    expect(methodeValide("LIFO")).toBeNull();
    expect(methodeValide(undefined)).toBeNull();
  });
});

describe("Valorisation FIFO — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Fifo A ${suffixe}`;
  const nomB = `TEST Fifo B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let P = "";
  let vendu: Date;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `fifo-a-${suffixe}@vertexone.test`, nomComplet: "Admin Fifo A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    await avecEntreprise(A, async (tx) => {
      const [r] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Farine", suiviStock: true, stockActuel: 0, coutMoyen: 0, creeParId: uA }).returning({ id: produit.id });
      P = r.id;
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const valeur = async (e = A, jusquau?: Date) => (await avecEntreprise(e, (tx) => lireValorisation(tx, e, jusquau)));
  const ligne = (v: Awaited<ReturnType<typeof valeur>>) => v.lignes.find((l) => l.id === P);

  test("méthode par défaut : coût moyen pondéré", async () => {
    expect(await avecEntreprise(A, (tx) => methodeDe(tx, A))).toBe("CMUP");
  }, 120_000);

  test("deux achats à des prix différents, puis une vente : le coût moyen et le FIFO divergent, comme attendu", async () => {
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: P, quantite: 10, prixUnitaire: 100 }]));
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: P, quantite: 10, prixUnitaire: 200 }]));
    expect(ligne(await valeur())).toMatchObject({ stockActuel: 20, valeur: 3000 }); // 20 × 150
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: P, quantite: 12, prixUnitaire: 500 }]));
    const cmup = await valeur();
    expect(cmup.methode).toBe("CMUP");
    expect(ligne(cmup)).toMatchObject({ stockActuel: 8, coutMoyen: 150, valeur: 1200 });

    // Le coût unitaire de chaque achat est conservé dans l'historique.
    const histo = await avecEntreprise(A, (tx) => tx.select({ type: mouvementStock.type, q: mouvementStock.quantite, cout: mouvementStock.coutUnitaire, creeLe: mouvementStock.creeLe }).from(mouvementStock).where(eq(mouvementStock.produitId, P)).orderBy(asc(mouvementStock.creeLe)));
    expect(histo.map((h) => [h.type, h.q, h.cout])).toEqual([["ACHAT", 10, 100], ["ACHAT", 10, 200], ["VENTE", -12, null]]);
    vendu = histo[2].creeLe;

    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ methodeValorisation: "FIFO" }).where(eq(entreprise.id, A)));
    const fifo = await valeur();
    expect(fifo.methode).toBe("FIFO");
    // Il reste 8 unités, toutes de la dernière couche (200) : 1 600 contre 1 200 au coût moyen.
    expect(ligne(fifo)).toMatchObject({ stockActuel: 8, coutMoyen: 200, valeur: 1600 });
    expect(fifo.total).toBe(1600);
    expect(fifo.ecart).toBe(1600); // rien n'est encore constaté en comptabilité
  }, 240_000);

  test("un troisième achat plus cher : le stock FIFO se compose des couches les plus récentes", async () => {
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: P, quantite: 10, prixUnitaire: 300 }]));
    const fifo = ligne(await valeur())!;
    expect(fifo.stockActuel).toBe(18);
    expect(fifo.valeur).toBe(10 * 300 + 8 * 200); // 4 600
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ methodeValorisation: "CMUP" }).where(eq(entreprise.id, A)));
    const cmup = ligne(await valeur())!;
    expect(cmup.valeur).toBe(18 * 233); // (8 × 150 + 3 000) / 18, arrondi à 233
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ methodeValorisation: "FIFO" }).where(eq(entreprise.id, A)));
  }, 240_000);

  test("à une date passée : couches et quantité de l'époque (juste après la vente, avant le troisième achat)", async () => {
    // +1 ms : Postgres garde des microsecondes, un Date JavaScript des millisecondes.
    const passe = await valeur(A, new Date(vendu.getTime() + 1));
    expect(passe.methode).toBe("FIFO");
    expect(ligne(passe)).toMatchObject({ stockActuel: 8, valeur: 1600 });
  }, 240_000);

  test("un stock sans historique est valorisé au coût de repli du produit", async () => {
    const [sans] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Sel", suiviStock: true, stockActuel: 5, coutMoyen: 700, creeParId: uA }).returning({ id: produit.id }));
    const v = await valeur();
    expect(v.lignes.find((l) => l.id === sans.id)).toMatchObject({ stockActuel: 5, valeur: 3500 });
  }, 120_000);

  test("fuite entre entreprises : B garde sa méthode et ne voit rien de A", async () => {
    expect(await avecEntreprise(B, (tx) => methodeDe(tx, B))).toBe("CMUP");
    const v = await valeur(B);
    expect(v.lignes).toEqual([]);
    expect(v.total).toBe(0);
  }, 120_000);
});
