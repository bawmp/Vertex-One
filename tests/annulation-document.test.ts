import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise, mouvementStock, produit, utilisateur } from "@/db/schema";
import { contrePasserEcritures, ecrituresDeLaFacture, ecrituresDeLaFactureFournisseur, ecrituresDuTicket } from "@/lib/comptabilite/contre-passation";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { activerSuiviStock, decrementerStockVente, defaireMouvementsDocument, incrementerStockAchat } from "@/lib/produits/stock";
import { creerDepot, listerDepots, stockParDepot, transfererStock } from "@/lib/produits/depots";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Annuler un document défait ses écritures (contre-passation) et ses mouvements de stock, une seule fois, sans toucher aux règlements
 * déjà reçus, et sans jamais agir sur une autre entreprise.
 */
describe("Annulation d'un document — stock et comptabilité", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Annulation A ${suffixe}`;
  const nomB = `TEST Annulation B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let c: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `annul-a-${suffixe}@vertexone.test`, nomComplet: "Admin Annulation A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    const comptes = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "512000", "601000", "706000", "443200", "401000", "445200"]));
    c = Object.fromEntries(comptes.map((x) => [x.numero, x.id]));
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (stock: number) => {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article annulation", prixAchat: 100, creeParId: uA }).returning({ id: produit.id }));
    await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, p.id, stock, uA));
    return p.id;
  };
  const stockDe = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s;
  const ec = (compte: string, debit: number, credit: number, extra: Partial<typeof ecritureComptable.$inferInsert>) => ({ entrepriseId: A, dateEcriture: new Date(), libelle: "Écriture test", compteId: c[compte], debit, credit, ...extra });

  test("facture annulée : le stock revient, les écritures sont contre-passées, le règlement reste", async () => {
    const id = await nouveau(10);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 4 }], { documentType: "FACTURE", documentId: "fac-1", utilisateurId: uA }));
    expect(await stockDe(id)).toBe(6);
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        ec("411000", 11925, 0, { factureId: "fac-1" }),
        ec("706000", 0, 10000, { factureId: "fac-1" }),
        ec("443200", 0, 1925, { factureId: "fac-1" }),
        // Règlement reçu : doit rester.
        ec("512000", 5000, 0, { factureId: "fac-1", paiementId: "pay-1" }),
        ec("411000", 0, 5000, { factureId: "fac-1", paiementId: "pay-1" }),
      ])
    );

    const nb = await avecEntreprise(A, (tx) => contrePasserEcritures(tx, A, ecrituresDeLaFacture("fac-1"), "Facture FAC-1"));
    expect(nb).toBe(3);
    const rendus = await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", "fac-1", uA));
    expect(rendus).toBe(1);
    expect(await stockDe(id)).toBe(10);

    const balance = await avecEntreprise(A, (tx) => calculerBalance(tx, A));
    const solde = (n: string) => balance.find((l) => l.numero === n)?.solde ?? 0;
    expect(solde("706000")).toBe(0); // vente annulée
    expect(solde("443200")).toBe(0);
    expect(solde("411000")).toBe(-5000); // le client a payé 5 000 d'une vente annulée : créditeur, à rembourser
    expect(solde("512000")).toBe(5000); // l'argent reçu reste reçu
    expect(balance.reduce((s, l) => s + l.debit, 0)).toBe(balance.reduce((s, l) => s + l.credit, 0));

    const miroirs = await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureId, "fac-1")));
    expect(miroirs.filter((m) => m.contrepasseId !== null)).toHaveLength(3);
    expect(miroirs.filter((m) => m.paiementId !== null && m.contrepasseId !== null)).toHaveLength(0);
  });

  test("annuler deux fois ne change rien (écritures et stock)", async () => {
    const id = await nouveau(10);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 3 }], { documentType: "FACTURE", documentId: "fac-2" }));
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values([ec("411000", 300, 0, { factureId: "fac-2" }), ec("706000", 0, 300, { factureId: "fac-2" })]));
    for (let i = 0; i < 3; i++) {
      await avecEntreprise(A, (tx) => contrePasserEcritures(tx, A, ecrituresDeLaFacture("fac-2"), "Facture FAC-2"));
      await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", "fac-2", uA));
    }
    expect(await stockDe(id)).toBe(10);
    const lignes = await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureId, "fac-2")));
    expect(lignes).toHaveLength(4);
    const retours = await avecEntreprise(A, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, id)));
    expect(retours.filter((m) => m.motif === "ANNULATION")).toHaveLength(1);
  });

  test("ticket de vente annulé : trésorerie remboursée, article remis en stock", async () => {
    const id = await nouveau(5);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 2 }], { documentType: "RECU_VENTE", documentId: "rv-1" }));
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values([ec("512000", 2000, 0, { recuVenteId: "rv-1" }), ec("706000", 0, 2000, { recuVenteId: "rv-1" })]));
    await avecEntreprise(A, (tx) => contrePasserEcritures(tx, A, ecrituresDuTicket("rv-1"), "Ticket REC-1"));
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "RECU_VENTE", "rv-1", uA));
    expect(await stockDe(id)).toBe(5);
    const nets = await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.recuVenteId, "rv-1")));
    expect(nets.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });

  test("facture fournisseur annulée : les articles ressortent du stock, le paiement déjà effectué reste", async () => {
    const id = await nouveau(2);
    await avecEntreprise(A, (tx) => incrementerStockAchat(tx, A, [{ produitId: id, quantite: 8, prixUnitaire: 100 }], { documentType: "FACTURE_FOURNISSEUR", documentId: "ff-1" }));
    expect(await stockDe(id)).toBe(10);
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        ec("601000", 800, 0, { factureFournisseurId: "ff-1" }),
        ec("401000", 0, 800, { factureFournisseurId: "ff-1" }),
        ec("401000", 300, 0, { factureFournisseurId: "ff-1", paiementEffectueId: "pe-1" }),
        ec("512000", 0, 300, { factureFournisseurId: "ff-1", paiementEffectueId: "pe-1" }),
      ])
    );
    expect(await avecEntreprise(A, (tx) => contrePasserEcritures(tx, A, ecrituresDeLaFactureFournisseur("ff-1"), "Facture fournisseur F"))).toBe(2);
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE_FOURNISSEUR", "ff-1", uA));
    expect(await stockDe(id)).toBe(2);
  });

  test("le dépôt d'origine est respecté, même après un transfert", async () => {
    const id = await nouveau(10);
    expect((await avecEntreprise(A, (tx) => creerDepot(tx, A, "Boutique annulation"))).ok).toBe(true);
    const depots = await avecEntreprise(A, (tx) => listerDepots(tx, A));
    const principal = depots.find((d) => d.principal)!;
    const boutique = depots.find((d) => !d.principal)!;
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 3 }], { documentType: "FACTURE", documentId: "fac-3" })); // sort du principal
    await avecEntreprise(A, (tx) => transfererStock(tx, A, id, principal.id, boutique.id, 4, uA)); // principal 3, boutique 4
    await avecEntreprise(A, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", "fac-3", uA));
    const rep = await avecEntreprise(A, (tx) => stockParDepot(tx, A, id));
    expect(Object.fromEntries(rep.map((d) => [d.nom, d.quantite]))).toEqual({ "Dépôt principal": 6, "Boutique annulation": 4 });
    expect(await stockDe(id)).toBe(10);
  });

  test("période verrouillée : l'annulation est refusée, rien n'est modifié", async () => {
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values([ec("411000", 100, 0, { factureId: "fac-4" }), ec("706000", 0, 100, { factureId: "fac-4" })]));
    await db.update(entreprise).set({ dateVerrouillageComptable: new Date(Date.now() + 5 * 24 * 3600 * 1000) }).where(eq(entreprise.id, A));
    await expect(avecEntreprise(A, (tx) => contrePasserEcritures(tx, A, ecrituresDeLaFacture("fac-4"), "Facture FAC-4"))).rejects.toThrow(/verrouill/i);
    expect(await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureId, "fac-4")))).toHaveLength(2);
    await db.update(entreprise).set({ dateVerrouillageComptable: null }).where(eq(entreprise.id, A));
  });

  test("fuite entre entreprises : B ne peut ni contre-passer les écritures de A ni remettre son stock", async () => {
    const id = await nouveau(10);
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: id, quantite: 2 }], { documentType: "FACTURE", documentId: "fac-5" }));
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values([ec("411000", 50, 0, { factureId: "fac-5" }), ec("706000", 0, 50, { factureId: "fac-5" })]));

    expect(await avecEntreprise(B, (tx) => contrePasserEcritures(tx, B, ecrituresDeLaFacture("fac-5"), "Tentative"))).toBe(0);
    expect(await avecEntreprise(B, (tx) => contrePasserEcritures(tx, A, ecrituresDeLaFacture("fac-5"), "Tentative avec l'identifiant de A"))).toBe(0);
    expect(await avecEntreprise(B, (tx) => defaireMouvementsDocument(tx, B, "FACTURE", "fac-5", null))).toBe(0);
    expect(await avecEntreprise(B, (tx) => defaireMouvementsDocument(tx, A, "FACTURE", "fac-5", null))).toBe(0);
    expect(await stockDe(id)).toBe(8);
    expect(await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureId, "fac-5")))).toHaveLength(2);
  });
});
