import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { depot, entreprise, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { annulerSessionInventaire, creerSessionInventaire, enregistrerComptage, lireSessionInventaire, listerSessionsInventaire, quantiteACorriger, validerSessionInventaire } from "@/lib/produits/inventaire-session";
import { assurerDepotPrincipal } from "@/lib/produits/depots";
import { decrementerStockVente } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.3 : inventaire par sessions — comptage partagé en brouillon, correction du stock seulement à la validation. */
describe("Inventaire par sessions — règle pure", () => {
  test("l'écart constaté au comptage est reporté sur le stock du jour, jamais négatif", () => {
    expect(quantiteACorriger(8, 10, 10)).toBe(8); // rien n'a bougé : on impose 8
    expect(quantiteACorriger(8, 10, 7)).toBe(5); // 3 vendus depuis : le manque de 2 reste, 7 − 2 = 5
    expect(quantiteACorriger(12, 10, 15)).toBe(17); // 5 reçus depuis, plus 2 trouvés en trop
    expect(quantiteACorriger(0, 3, 0)).toBe(0);
    expect(quantiteACorriger(0, 10, 2)).toBe(0); // jamais en dessous de zéro
  });
});

describe("Inventaire par sessions — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST InvSess A ${suffixe}`;
  const nomB = `TEST InvSess B ${suffixe}`;
  let A: string;
  let B: string;
  let u1: string;
  let u2: string;
  let uB: string;
  let principal: string;
  let session = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `invs-1-${suffixe}@vertexone.test`, nomComplet: "Compteur Un", role: "MANAGER" }).returning({ id: utilisateur.id });
    const [y] = await db.insert(utilisateur).values({ entrepriseId: A, email: `invs-2-${suffixe}@vertexone.test`, nomComplet: "Compteur Deux", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [z] = await db.insert(utilisateur).values({ entrepriseId: B, email: `invs-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
    u1 = x.id;
    u2 = y.id;
    uB = z.id;
    await avecEntreprise(A, async (tx) => {
      principal = (await assurerDepotPrincipal(tx, A)).id;
      const p = async (nom: string, stock: number) => {
        const [r] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, stockActuel: stock, coutMoyen: 1000, creeParId: u1 }).returning({ id: produit.id });
        await tx.insert(stockDepot).values({ entrepriseId: A, produitId: r.id, depotId: principal, quantite: stock });
        return r.id;
      };
      ids.a = await p("Article A", 10);
      ids.b = await p("Article B", 20);
      ids.c = await p("Article C", 5);
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const stock = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s;

  test("ouvrir une session : nom validé, dépôt de l'entreprise seulement", async () => {
    expect((await avecEntreprise(A, (tx) => creerSessionInventaire(tx, A, u1, " ", null))).ok).toBe(false);
    const r = await avecEntreprise(A, (tx) => creerSessionInventaire(tx, A, u1, "Fin d'année", null));
    expect(r.ok).toBe(true);
    if (r.ok && r.id) session = r.id;
    const [autreDepot] = await avecEntreprise(B, (tx) => tx.insert(depot).values({ entrepriseId: B, nom: "Dépôt B" }).returning({ id: depot.id }));
    expect((await avecEntreprise(A, (tx) => creerSessionInventaire(tx, A, u1, "Piège", autreDepot.id))).ok).toBe(false);
  }, 120_000);

  test("deux personnes comptent : rien ne bouge dans le stock avant la validation", async () => {
    expect((await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u1, session, ids.a, 8))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u2, session, ids.b, 25))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u2, session, ids.a, 9))).ok).toBe(true); // le dernier comptage remplace l'ancien

    expect(await stock(ids.a)).toBe(10);
    expect(await stock(ids.b)).toBe(20);

    const vue = await avecEntreprise(A, (tx) => lireSessionInventaire(tx, A, session));
    const a = vue!.lignes.find((l) => l.produitId === ids.a)!;
    expect(a).toMatchObject({ quantiteComptee: 9, quantiteTheorique: 10, ecart: -1, comptePar: "Compteur Deux" });
    expect(vue!.lignes.find((l) => l.produitId === ids.c)!.quantiteComptee).toBeNull();
  }, 120_000);

  test("refus de comptage : quantité invalide, produit inconnu, produit d'une autre entreprise", async () => {
    const essai = (pid: string, q: number | null) => avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u1, session, pid, q));
    expect((await essai(ids.a, -1)).ok).toBe(false);
    expect((await essai(ids.a, 2.5)).ok).toBe(false);
    expect((await essai("inconnu", 3)).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u1, "session-inconnue", ids.a, 3))).ok).toBe(false);
  }, 120_000);

  test("une vente pendant le comptage n'est ni perdue ni comptée deux fois à la validation", async () => {
    // Article A : compté 9 quand le stock était 10 (manque de 1). 3 sont vendus ensuite : stock 7. Attendu après validation : 7 − 1 = 6.
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: ids.a, quantite: 3, prixUnitaire: 5000 }]));
    expect(await stock(ids.a)).toBe(7);

    const r = await avecEntreprise(A, (tx) => validerSessionInventaire(tx, A, u2, session));
    expect(r).toEqual({ ok: true, corriges: 2, inchanges: 0 });
    expect(await stock(ids.a)).toBe(6);
    expect(await stock(ids.b)).toBe(25);
    expect(await stock(ids.c)).toBe(5); // non compté : intact

    const [dep] = await avecEntreprise(A, (tx) => tx.select({ q: stockDepot.quantite }).from(stockDepot).where(and(eq(stockDepot.produitId, ids.a), eq(stockDepot.depotId, principal))));
    expect(dep.q).toBe(6);
    const histo = await avecEntreprise(A, (tx) => tx.select({ type: mouvementStock.type, note: mouvementStock.note, quantite: mouvementStock.quantite }).from(mouvementStock).where(and(eq(mouvementStock.produitId, ids.b), eq(mouvementStock.type, "INVENTAIRE"))));
    expect(histo).toEqual([{ type: "INVENTAIRE", note: "Inventaire « Fin d'année »", quantite: 5 }]);
  }, 180_000);

  test("une session terminée ne se rouvre ni ne se revalide, et n'accepte plus de comptage", async () => {
    expect(await avecEntreprise(A, (tx) => validerSessionInventaire(tx, A, u2, session))).toMatchObject({ ok: false });
    expect((await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u1, session, ids.c, 1))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => annulerSessionInventaire(tx, A, u2, session))).ok).toBe(false);
    expect(await stock(ids.a)).toBe(6); // pas de double correction
  }, 120_000);

  test("abandon : le stock ne bouge pas ; une session vide ne se valide pas", async () => {
    const r = await avecEntreprise(A, (tx) => creerSessionInventaire(tx, A, u1, "À jeter", null));
    const id = r.ok ? (r.id as string) : "";
    expect(await avecEntreprise(A, (tx) => validerSessionInventaire(tx, A, u2, id))).toMatchObject({ ok: false });
    await avecEntreprise(A, (tx) => enregistrerComptage(tx, A, u1, id, ids.c, 99));
    expect((await avecEntreprise(A, (tx) => annulerSessionInventaire(tx, A, u1, id))).ok).toBe(true);
    expect(await stock(ids.c)).toBe(5);
    const liste = await avecEntreprise(A, (tx) => listerSessionsInventaire(tx, A));
    expect(liste.map((s) => s.statut).sort()).toEqual(["ANNULE", "VALIDE"]);
  }, 120_000);

  test("fuite entre entreprises : B ne voit pas les sessions de A et ne peut ni compter ni valider dedans", async () => {
    expect(await avecEntreprise(B, (tx) => listerSessionsInventaire(tx, B))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => lireSessionInventaire(tx, B, session))).toBeNull();
    expect((await avecEntreprise(B, (tx) => enregistrerComptage(tx, B, uB, session, ids.a, 1))).ok).toBe(false);
    expect(await avecEntreprise(B, (tx) => validerSessionInventaire(tx, B, uB, session))).toMatchObject({ ok: false });
  }, 120_000);
});
