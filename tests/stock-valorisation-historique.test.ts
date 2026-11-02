import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { depot, entreprise, mouvementStock, produit, stockDepot, utilisateur } from "@/db/schema";
import { incrementerStockAchat } from "@/lib/produits/stock";
import { assurerDepotPrincipal } from "@/lib/produits/depots";
import { lireValorisation } from "@/lib/produits/valorisation";
import { dateDouala } from "@/lib/comptabilite/livres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Priorité 2.6 : valeur du stock à une date passée et par dépôt. L'état actuel est reconstitué en défaisant les mouvements postérieurs
 * à la date ; le coût moyen est celui enregistré après le dernier mouvement antérieur (colonne remplie par un déclencheur de la base).
 */
describe("Valeur du stock à une date passée et par dépôt", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST ValoH A ${suffixe}`;
  const nomB = `TEST ValoH B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let idP: string;
  let principal: string;
  let secondaire: string;
  const maintenant = new Date("2026-11-02T10:00:00Z");
  const fin = (jour: string) => dateDouala(jour, true)!;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `valoh-a-${suffixe}@vertexone.test`, nomComplet: "Admin ValoH A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;

    await avecEntreprise(A, async (tx) => {
      const p = await assurerDepotPrincipal(tx, A);
      principal = p.id;
      const [d2] = await tx.insert(depot).values({ entrepriseId: A, nom: "Entrepôt" }).returning({ id: depot.id });
      secondaire = d2.id;
      // État actuel : 30 en stock à 150 ; 8 à l'entrepôt, le reste au dépôt principal.
      const [prod] = await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article historique", suiviStock: true, stockActuel: 30, coutMoyen: 150, prixAchat: 100, creeParId: uA }).returning({ id: produit.id });
      idP = prod.id;
      await tx.insert(stockDepot).values([
        { entrepriseId: A, produitId: idP, depotId: principal, quantite: 22 },
        { entrepriseId: A, produitId: idP, depotId: secondaire, quantite: 8 },
      ]);
      const mv = (type: "INITIAL" | "ACHAT" | "VENTE" | "TRANSFERT_SORTIE" | "TRANSFERT_ENTREE", quantite: number, stockApres: number, date: string, cout: number, depotId: string) => ({
        entrepriseId: A, produitId: idP, type, quantite, stockApres, creeLe: new Date(date), coutMoyenApres: cout, depotId,
      });
      await tx.insert(mouvementStock).values([
        mv("INITIAL", 10, 10, "2026-01-10T09:00:00Z", 100, principal),
        mv("ACHAT", 30, 40, "2026-03-05T09:00:00Z", 150, principal),
        mv("TRANSFERT_SORTIE", -8, 40, "2026-04-10T09:00:00Z", 150, principal),
        mv("TRANSFERT_ENTREE", 8, 40, "2026-04-10T09:00:00Z", 150, secondaire),
        mv("VENTE", -10, 30, "2026-06-15T09:00:00Z", 150, principal),
      ]);
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const valo = (e: string, jour: string | null, depotId: string | null = null) => avecEntreprise(e, (tx) => lireValorisation(tx, e, jour ? fin(jour) : maintenant, depotId, maintenant));
  const ligne = (v: Awaited<ReturnType<typeof valo>>) => v.lignes.find((l) => l.id === idP);

  test("aujourd'hui : stock et coût courants ; avant le premier mouvement : zéro", async () => {
    const maintenantV = await valo(A, null);
    expect(ligne(maintenantV)).toMatchObject({ stockActuel: 30, coutMoyen: 150, valeur: 4500 });
    const avant = await valo(A, "2025-12-31");
    expect(ligne(avant)).toMatchObject({ stockActuel: 0, valeur: 0 });
    expect(avant.total).toBe(0);
  });

  test("à des dates passées : quantité reconstituée et coût moyen de l'époque", async () => {
    expect(ligne(await valo(A, "2026-02-01"))).toMatchObject({ stockActuel: 10, coutMoyen: 100, valeur: 1000 });
    expect(ligne(await valo(A, "2026-04-01"))).toMatchObject({ stockActuel: 40, coutMoyen: 150, valeur: 6000 });
    expect(ligne(await valo(A, "2026-06-20"))).toMatchObject({ stockActuel: 30, coutMoyen: 150, valeur: 4500 });
    // Le jour même d'un mouvement : le mouvement compte (la date est inclusive, fin de journée).
    expect(ligne(await valo(A, "2026-03-05"))).toMatchObject({ stockActuel: 40, coutMoyen: 150 });
  });

  test("par dépôt : un transfert déplace la valeur sans changer le total ; le principal reçoit le reste", async () => {
    expect(ligne(await valo(A, "2026-04-01", principal))).toMatchObject({ stockActuel: 40, valeur: 6000 });
    expect((await valo(A, "2026-04-01", secondaire)).lignes).toEqual([]); // rien à l'entrepôt avant le transfert
    expect(ligne(await valo(A, "2026-05-01", principal))).toMatchObject({ stockActuel: 32, valeur: 4800 });
    expect(ligne(await valo(A, "2026-05-01", secondaire))).toMatchObject({ stockActuel: 8, valeur: 1200 });
    expect(ligne(await valo(A, null, principal))).toMatchObject({ stockActuel: 22, valeur: 3300 });
    expect(ligne(await valo(A, null, secondaire))).toMatchObject({ stockActuel: 8, valeur: 1200 });
    const total = (await valo(A, "2026-05-01", principal)).total + (await valo(A, "2026-05-01", secondaire)).total;
    expect(total).toBe((await valo(A, "2026-05-01")).total);
  });

  test("le déclencheur de la base enregistre le coût moyen après chaque nouveau mouvement", async () => {
    await avecEntreprise(A, async (tx) => {
      await tx.update(produit).set({ stockActuel: 30, coutMoyen: 150 }).where(eq(produit.id, idP));
      await incrementerStockAchat(tx, A, [{ produitId: idP, quantite: 10, prixUnitaire: 350 }]); // (30×150 + 3500) / 40 = 200
    });
    const mouvements = await avecEntreprise(A, (tx) => tx.select({ type: mouvementStock.type, cout: mouvementStock.coutMoyenApres, creeLe: mouvementStock.creeLe }).from(mouvementStock).where(eq(mouvementStock.produitId, idP)));
    const dernier = mouvements.sort((x, y) => y.creeLe.getTime() - x.creeLe.getTime())[0];
    expect(dernier.type).toBe("ACHAT");
    expect(dernier.cout).toBe(200);
  }, 90_000);

  test("fuite entre entreprises : B ne voit rien de A, même avec un dépôt de A", async () => {
    expect((await valo(B, "2026-04-01")).lignes).toEqual([]);
    expect((await valo(B, null, secondaire)).lignes).toEqual([]);
    expect((await valo(B, null, secondaire)).total).toBe(0);
  });
});
