import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { avoirClient, compteComptable, contact, ecritureComptable, entreprise, facture, ligneFacture, mouvementStock, paiement, produit, utilisateur } from "@/db/schema";
import { creerAvoirClient, lignesCreditables, listerAvoirsFacture } from "@/lib/facturation/avoir-client";
import { lireSolde, montantNetFacture } from "@/lib/facturation/solde";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { activerSuiviStock, decrementerStockVente } from "@/lib/produits/stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Avoir client partiel (priorité 1.2) : quantités plafonnées par ligne, montant et TVA exacts, écritures miroir, stock remis ou non
 * ligne par ligne, montant restant dû réduit, facture entièrement créditée = annulée, et jamais d'effet sur une autre entreprise.
 */
describe("Avoirs clients partiels et retours", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Avoir A ${suffixe}`;
  const nomB = `TEST Avoir B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  let clientA: string;
  const comptes: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `avoir-a-${suffixe}@vertexone.test`, nomComplet: "Admin Avoir A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: B, email: `avoir-b-${suffixe}@vertexone.test`, nomComplet: "Admin Avoir B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    uB = ub.id;
    const [c] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Client Avoir", telephone: "+237600000099", assigneAId: uA }).returning({ id: contact.id }));
    clientA = c.id;
    const rows = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "706000", "443200"]));
    for (const r of rows) comptes[r.numero] = r.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  /** Une facture de 10 pièces à 1 000 (produit suivi, sorti du stock) + 1 prestation à 5 000, TVA 19,25 %. */
  async function nouvelleFacture() {
    const [p] = await avecEntreprise(A, (tx) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom: "Article avoir", prixAchat: 600, prixVente: 1000, creeParId: uA }).returning({ id: produit.id }));
    await avecEntreprise(A, (tx) => activerSuiviStock(tx, A, p.id, 20, uA));
    const numero = `FAC-TEST-${Math.random().toString(36).slice(2, 8)}`;
    const montantHT = 10 * 1000 + 5000;
    const montantTVA = Math.round(10000 * 0.1925) + Math.round(5000 * 0.1925);
    const [f] = await avecEntreprise(A, (tx) =>
      tx
        .insert(facture)
        .values({ entrepriseId: A, contactId: clientA, assigneAId: uA, numero, statut: "EMISE", montantHT, montantTVA, montantTTC: montantHT + montantTVA, dateEcheance: new Date(Date.now() + 864e5 * 30), dateEmission: new Date() } as typeof facture.$inferInsert)
        .returning({ id: facture.id })
    );
    const lignes = await avecEntreprise(A, (tx) =>
      tx
        .insert(ligneFacture)
        .values([
          { entrepriseId: A, factureId: f.id, produitId: p.id, designation: "Article avoir", quantite: 10, prixUnitaire: 1000, tauxTVA: 19.25 },
          { entrepriseId: A, factureId: f.id, produitId: null, designation: "Livraison", quantite: 1, prixUnitaire: 5000, tauxTVA: 19.25 },
        ])
        .returning({ id: ligneFacture.id, designation: ligneFacture.designation })
    );
    await avecEntreprise(A, (tx) => decrementerStockVente(tx, A, [{ produitId: p.id, quantite: 10 }], { documentType: "FACTURE", documentId: f.id, utilisateurId: uA }));
    const [article] = lignes.filter((l) => l.designation === "Article avoir");
    const [livraison] = lignes.filter((l) => l.designation === "Livraison");
    return { factureId: f.id, produitId: p.id, ligneArticle: article.id, ligneLivraison: livraison.id, montantTTC: montantHT + montantTVA, numero };
  }
  const stockDe = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ s: produit.stockActuel }).from(produit).where(eq(produit.id, id))))[0].s;
  const ttc = (ht: number) => ht + Math.round(ht * 0.1925);

  test("avoir partiel : montant exact, écritures miroir, stock remis, restant dû réduit", async () => {
    const F = await nouvelleFacture();
    expect(await stockDe(F.produitId)).toBe(10);

    const r = await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 3, remettreEnStock: true }], "Retour de 3 pièces"));
    expect(r).toMatchObject({ ok: true, montantTTC: ttc(3000), factureAnnulee: false });
    if (!r.ok) throw new Error("avoir refusé");
    expect(r.numero).toMatch(/^AV-\d{4}-\d{6}$/);

    expect(await stockDe(F.produitId)).toBe(13);
    const mouvements = await avecEntreprise(A, (tx) => tx.select().from(mouvementStock).where(eq(mouvementStock.produitId, F.produitId)));
    const retour = mouvements.find((m) => m.documentType === "AVOIR_CLIENT");
    expect(retour).toMatchObject({ quantite: 3, motif: "RETOUR_CLIENT", type: "AJOUT" });

    const ecritures = await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureId, F.factureId)));
    const parCompte = (id: string) => ecritures.filter((e) => e.compteId === id);
    expect(parCompte(comptes["706000"]).reduce((s, e) => s + e.debit, 0)).toBe(3000);
    expect(parCompte(comptes["443200"]).reduce((s, e) => s + e.debit, 0)).toBe(Math.round(3000 * 0.1925));
    expect(parCompte(comptes["411000"]).reduce((s, e) => s + e.credit, 0)).toBe(ttc(3000));

    expect(await avecEntreprise(A, (tx) => montantNetFacture(tx, F.factureId, F.montantTTC))).toBe(F.montantTTC - ttc(3000));
    expect((await avecEntreprise(A, (tx) => lireSolde(tx, F.factureId, F.montantTTC))).solde).toBe(F.montantTTC - ttc(3000));
    const lignes = await avecEntreprise(A, (tx) => lignesCreditables(tx, A, F.factureId));
    expect(lignes.find((l) => l.ligneFactureId === F.ligneArticle)).toMatchObject({ facturee: 10, creditee: 3, restant: 7 });
  });

  test("un article cassé n'est pas remis en stock, et le plafond par ligne tient tous avoirs confondus", async () => {
    const F = await nouvelleFacture();
    await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 4, remettreEnStock: false }], "Pièces cassées au transport"));
    expect(await stockDe(F.produitId)).toBe(10);

    expect((await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 7, remettreEnStock: true }], "Trop"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 6, remettreEnStock: true }], "Reste exact"))).ok).toBe(true);
    expect(await stockDe(F.produitId)).toBe(16);
    expect((await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }], "Plus rien à créditer"))).ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => listerAvoirsFacture(tx, A, F.factureId))).map((a) => a.numero)).toHaveLength(2);
  });

  test("garde-fous : motif obligatoire, quantités invalides, ligne étrangère, service jamais remis en stock", async () => {
    const F = await nouvelleFacture();
    const essai = (lignes: Parameters<typeof creerAvoirClient>[4], motif = "Motif valable") => avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, lignes, motif));
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }], "x")).ok).toBe(false);
    expect((await essai([])).ok).toBe(false);
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: 0, remettreEnStock: false }])).ok).toBe(false);
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: -2, remettreEnStock: false }])).ok).toBe(false);
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: 1.234, remettreEnStock: false }])).ok).toBe(false);
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: 2.5, remettreEnStock: true }])).ok).toBe(false); // entier exigé pour le stock
    expect((await essai([{ ligneFactureId: "inconnue", quantite: 1, remettreEnStock: false }])).ok).toBe(false);
    expect((await essai([{ ligneFactureId: F.ligneLivraison, quantite: 1, remettreEnStock: true }])).ok).toBe(false); // prestation : pas de stock
    expect((await essai([{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }, { ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }])).ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => tx.select().from(avoirClient).where(eq(avoirClient.factureId, F.factureId)))).toHaveLength(0);
    expect(await stockDe(F.produitId)).toBe(10);
  });

  test("facture réglée par avance : l'avoir peut la rendre payée ; entièrement créditée, elle est annulée", async () => {
    const F = await nouvelleFacture();
    // Le client a déjà payé 5 000 ; l'avoir de la livraison (5 000 HT) ramène le net à 11 925 + ... ; on en crédite assez pour que le payé couvre le net.
    await avecEntreprise(A, (tx) => tx.insert(paiement).values({ entrepriseId: A, factureId: F.factureId, montant: ttc(10000), moyenPaiement: "manuel", datePaiement: new Date() }));
    const r1 = await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneLivraison, quantite: 1, remettreEnStock: false }], "Livraison offerte"));
    expect(r1).toMatchObject({ ok: true, factureAnnulee: false });
    const [apres1] = await avecEntreprise(A, (tx) => tx.select({ s: facture.statut }).from(facture).where(eq(facture.id, F.factureId)));
    expect(apres1.s).toBe("PAYEE"); // payé = net

    const r2 = await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 10, remettreEnStock: true }], "Tout est retourné"));
    expect(r2).toMatchObject({ ok: true, factureAnnulee: true });
    const [apres2] = await avecEntreprise(A, (tx) => tx.select({ s: facture.statut }).from(facture).where(eq(facture.id, F.factureId)));
    expect(apres2.s).toBe("ANNULEE");
    expect(await stockDe(F.produitId)).toBe(20);
    const balance = await avecEntreprise(A, (tx) => calculerBalance(tx, A));
    expect(balance.reduce((s, l) => s + l.debit, 0)).toBe(balance.reduce((s, l) => s + l.credit, 0));
    expect((await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }], "Encore"))).ok).toBe(false);
  });

  test("période verrouillée : l'avoir est refusé sans rien modifier", async () => {
    const F = await nouvelleFacture();
    await db.update(entreprise).set({ dateVerrouillageComptable: new Date(Date.now() + 5 * 24 * 3600 * 1000) }).where(eq(entreprise.id, A));
    const r = await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 2, remettreEnStock: true }], "Verrou"));
    await db.update(entreprise).set({ dateVerrouillageComptable: null }).where(eq(entreprise.id, A));
    expect(r.ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => tx.select().from(avoirClient).where(eq(avoirClient.factureId, F.factureId)))).toHaveLength(0);
    expect(await stockDe(F.produitId)).toBe(10);
  });

  test("fuite entre entreprises : B ne voit ni ne crédite la facture de A, et ne voit aucun de ses avoirs", async () => {
    const F = await nouvelleFacture();
    await avecEntreprise(A, (tx) => creerAvoirClient(tx, A, uA, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: false }], "Geste"));
    const tentative = await avecEntreprise(B, (tx) => creerAvoirClient(tx, B, uB, F.factureId, [{ ligneFactureId: F.ligneArticle, quantite: 1, remettreEnStock: true }], "Tentative"));
    expect(tentative.ok).toBe(false);
    expect(await avecEntreprise(B, (tx) => listerAvoirsFacture(tx, B, F.factureId))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => lignesCreditables(tx, B, F.factureId))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => tx.select().from(avoirClient))).toEqual([]);
    await expect(avecEntreprise(B, (tx) => tx.insert(avoirClient).values({ entrepriseId: A, factureId: F.factureId, numero: "AV-FAUX", motif: "x", montantHT: 1, montantTVA: 0, montantTTC: 1, creeParId: uB }))).rejects.toThrow();
    expect(await stockDe(F.produitId)).toBe(10);
  });
});
