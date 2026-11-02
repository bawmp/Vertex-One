import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { contact, depot, devis, entreprise, facture, ligneDevis, mouvementStock, produit, utilisateur } from "@/db/schema";
import { archiverDepot, creerDepot, listerDepots, resoudreDepotDocument, stockParDepot, verifierDepotDocument } from "@/lib/produits/depots";
import { activerSuiviStock, decrementerStockVente, defaireMouvementsDocument, incrementerStockAchat } from "@/lib/produits/stock";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Choix du dépôt sur les documents (priorité 1.3) : un document qui nomme un dépôt y fait sortir (vente) ou entrer (achat) son stock ;
 * sans choix, c'est le dépôt principal ; un dépôt d'une autre entreprise ou archivé est refusé.
 */
describe("Dépôt choisi sur un document", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST DepotDoc A ${suffixe}`;
  const nomB = `TEST DepotDoc B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let principal: string;
  let boutique: string;
  let depotDeB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true, niu: "M012600000009Z" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `depotdoc-a-${suffixe}@vertexone.test`, nomComplet: "Admin DepotDoc A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    await avecEntreprise(A, (tx) => creerDepot(tx, A, "Boutique doc"));
    const depotsA = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    principal = depotsA.find((d) => d.principal)!.id;
    boutique = depotsA.find((d) => !d.principal)!.id;
    await avecEntreprise(B, (tx) => creerDepot(tx, B, "Boutique de B"));
    depotDeB = (await avecEntreprise(B, (tx) => listerDepots(tx, B))).find((d) => !d.principal)!.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (stock: number) => {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article depot doc", prixAchat: 100, creeParId: uA }).returning({ id: produit.id }));
    await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, p.id, stock, uA)); // tout dans le dépôt principal
    return p.id;
  };
  const repartition = async (id: string) => Object.fromEntries((await avecEntreprise(A, (tx) => stockParDepot(tx, A, id))).map((d) => [d.nom, d.quantite]));

  test("vérification : vide = principal, dépôt actif accepté, étranger, archivé et inconnu refusés", async () => {
    expect(await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, undefined))).toEqual({ ok: true, depotId: null });
    expect(await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, boutique))).toEqual({ ok: true, depotId: boutique });
    expect((await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, depotDeB))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, "inconnu"))).ok).toBe(false);
    const [temp] = [await avecEntreprise(A, (tx) => creerDepot(tx, A, "Temporaire doc"))];
    if (!temp.ok || !temp.id) throw new Error("création refusée");
    await avecEntreprise(A, (tx) => archiverDepot(tx, A, temp.id!));
    expect((await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, temp.id))).ok).toBe(false);
    // Un dépôt archivé après coup retombe sur le principal au moment du mouvement.
    expect(await avecEntreprise(A, (tx) => resoudreDepotDocument(tx, A, temp.id))).toBe(principal);
    expect(await avecEntreprise(A, (tx) => resoudreDepotDocument(tx, A, boutique))).toBe(boutique);
    expect(await avecEntreprise(A, (tx) => resoudreDepotDocument(tx, A, null))).toBe(principal);
  });

  test("une vente avec dépôt sort du dépôt choisi, sans lui : du principal ; un achat entre dans le dépôt choisi", async () => {
    const id = await nouveau(10);
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: id, quantite: 6, prixUnitaire: 100 }], { documentType: "FACTURE_FOURNISSEUR", documentId: "ff-d1", depotId: boutique }));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 10, "Boutique doc": 6 });
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 4 }], { documentType: "RECU_VENTE", documentId: "rv-d1", depotId: boutique }));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 10, "Boutique doc": 2 });
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 3 }], { documentType: "RECU_VENTE", documentId: "rv-d2" }));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 7, "Boutique doc": 2 });
    const [m] = await avecEntreprise(A, (tx) => tx.select({ depotId: mouvementStock.depotId }).from(mouvementStock).where(eq(mouvementStock.documentId, "rv-d1")));
    expect(m.depotId).toBe(boutique);
  });

  test("l'annulation d'un document remet le stock dans le dépôt qu'il avait choisi", async () => {
    const id = await nouveau(5);
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: id, quantite: 5, prixUnitaire: 100 }], { documentType: "FACTURE_FOURNISSEUR", documentId: "ff-d2", depotId: boutique }));
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 3 }], { documentType: "FACTURE", documentId: "fac-d1", depotId: boutique }));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 5, "Boutique doc": 2 });
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", "fac-d1", uA));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 5, "Boutique doc": 5 });
  });

  test("devis accepté : la facture hérite du dépôt du devis et le stock sort de ce dépôt", async () => {
    const id = await nouveau(8);
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: id, quantite: 4, prixUnitaire: 100 }], { documentType: "FACTURE_FOURNISSEUR", documentId: "ff-d3", depotId: boutique }));
    const [c] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Client DepotDoc", telephone: "+237600000077", assigneAId: uA }).returning({ id: contact.id }));
    const [d] = await avecEntreprise(A, (tx) =>
      tx
        .insert(devis)
        .values({ entrepriseId: A, numero: `DEV-TEST-${suffixe}`, contactId: c.id, assigneAId: uA, depotId: boutique, dateValidite: new Date(Date.now() + 864e5), montantHT: 2000, montantTVA: 385, montantTTC: 2385, creeParId: uA } as typeof devis.$inferInsert)
        .returning({ id: devis.id })
    );
    await avecEntreprise(A, (tx) => tx.insert(ligneDevis).values({ entrepriseId: A, devisId: d.id, produitId: id, designation: "Article depot doc", quantite: 2, prixUnitaire: 1000, tauxTVA: 19.25 }));
    const factureId = await avecEntreprise(A, (tx) => accepterDevisEtCreerFacture(tx, A, d.id));
    expect(factureId).toBeTruthy();
    const [f] = await avecEntreprise(A, (tx) => tx.select({ depotId: facture.depotId }).from(facture).where(eq(facture.id, factureId!)));
    expect(f.depotId).toBe(boutique);
    expect(await repartition(id)).toEqual({ "Dépôt principal": 8, "Boutique doc": 2 });
  });

  test("fuite entre entreprises : le dépôt de B n'est ni vérifiable ni utilisable depuis A, ni l'inverse", async () => {
    const id = await nouveau(3);
    expect((await avecEntreprise(A, (tx) => verifierDepotDocument(tx, A, depotDeB))).ok).toBe(false);
    // Même si un identifiant étranger arrivait jusqu'au mouvement, il retombe sur le dépôt principal de A.
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 1 }], { documentType: "FACTURE", documentId: "fac-d9", depotId: depotDeB }));
    expect(await repartition(id)).toEqual({ "Dépôt principal": 2, "Boutique doc": 0 });
    expect(await avecEntreprise(B, (tx) => tx.select().from(depot).where(eq(depot.id, boutique)))).toEqual([]);
    expect((await avecEntreprise(B, (tx) => verifierDepotDocument(tx, B, boutique))).ok).toBe(false);
  });
});
