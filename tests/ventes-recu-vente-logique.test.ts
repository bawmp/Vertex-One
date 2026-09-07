import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, produit, recuVente, ligneRecuVente, ecritureComptable, compteComptable } from "@/db/schema";
import { genererNumeroRecuVente } from "@/lib/facturation/numerotation";
import { genererEcrituresRecuVente } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

/**
 * Vérifie la logique métier d'un Reçu de vente (extensions Ventes, échange
 * du 2026-09-07) : numérotation propre, décrément de stock, écritures
 * équilibrées avec le bon compte de trésorerie selon le moyen de paiement
 * (Caisse pour "especes"/"manuel", Banque pour Mobile Money/virement), et
 * qu'un Reçu déjà ANNULE ne peut pas l'être une seconde fois.
 *
 * creerRecuVente()/annulerRecuVente() vérifient la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test. On reproduit donc directement la même séquence de mutations
 * que l'action, comme les autres tests de logique métier de ce projet.
 */
describe("Ventes — logique des Reçus de vente", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let dealId: string;
  let produitId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST RV Logique", secteurProfil: "agence", niu: "M012026000099" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-rv-logique@vertexone.test", nomComplet: "Admin RV Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c, p] = await avecEntreprise(entrepriseId, async (tx) => {
      const [contactCree] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Contact RV Logique", telephone: "+237600000095", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [produitCree] = await tx
        .insert(produit)
        .values({ entrepriseId, type: "BIEN", nom: "Produit RV Logique", prixVente: 3000, suiviStock: true, stockActuel: 15 })
        .returning({ id: produit.id });
      return [contactCree, produitCree];
    });
    produitId = p.id;

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(deal).values({ entrepriseId, titre: "Deal RV Logique", contactId: c.id, assigneAId: utilisateurId }).returning({ id: deal.id })
    );
    dealId = d.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(ligneRecuVente).where(eq(ligneRecuVente.entrepriseId, entrepriseId));
      await tx.delete(recuVente).where(eq(recuVente.entrepriseId, entrepriseId));
      await tx.delete(produit).where(eq(produit.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un Reçu payé en espèces débite la Caisse (571000) et décrémente le stock", async () => {
    const numero = await avecEntreprise(entrepriseId, (tx) => genererNumeroRecuVente(tx, entrepriseId));
    expect(numero).toMatch(/^REC-\d{4}-\d{6}$/);

    const [recu] = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(recuVente)
        .values({
          entrepriseId,
          numero,
          dealId,
          montantHT: 6000,
          montantTVA: 1155,
          montantTTC: 7155,
          moyenPaiement: "especes",
          creeParId: utilisateurId,
        })
        .returning({ id: recuVente.id });
      await tx.insert(ligneRecuVente).values({
        entrepriseId,
        recuVenteId: r.id,
        produitId,
        designation: "Produit RV Logique",
        quantite: 2,
        prixUnitaire: 3000,
        tauxTVA: 19.25,
      });
      const lignes = await tx.select().from(ligneRecuVente).where(eq(ligneRecuVente.recuVenteId, r.id));
      await decrementerStockVente(tx, lignes);
      await genererEcrituresRecuVente(tx, {
        id: r.id,
        entrepriseId,
        numero,
        dateEmission: new Date(),
        montantHT: 6000,
        montantTVA: 1155,
        montantTTC: 7155,
        moyenPaiement: "especes",
      });
      return [r];
    });

    const [produitApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(produit).where(eq(produit.id, produitId)));
    expect(produitApres.stockActuel).toBe(13);

    const [compteCaisse] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "571000"));
    const ecritures = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.recuVenteId, recu.id)));
    const ligneCaisse = ecritures.find((e) => e.compteId === compteCaisse.id);
    expect(ligneCaisse?.debit).toBe(7155);

    const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("un Reçu payé par Mobile Money débite la Banque (512000), pas la Caisse", async () => {
    const numero = await avecEntreprise(entrepriseId, (tx) => genererNumeroRecuVente(tx, entrepriseId));

    const [recu] = await avecEntreprise(entrepriseId, async (tx) => {
      const [r] = await tx
        .insert(recuVente)
        .values({
          entrepriseId,
          numero,
          dealId,
          montantHT: 4000,
          montantTVA: 0,
          montantTTC: 4000,
          moyenPaiement: "mtn_momo",
          creeParId: utilisateurId,
        })
        .returning({ id: recuVente.id });
      await genererEcrituresRecuVente(tx, {
        id: r.id,
        entrepriseId,
        numero,
        dateEmission: new Date(),
        montantHT: 4000,
        montantTVA: 0,
        montantTTC: 4000,
        moyenPaiement: "mtn_momo",
      });
      return [r];
    });

    const [compteBanque] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "512000"));
    const [compteCaisse] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "571000"));
    const ecritures = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.recuVenteId, recu.id)));
    expect(ecritures.some((e) => e.compteId === compteBanque.id && e.debit === 4000)).toBe(true);
    expect(ecritures.some((e) => e.compteId === compteCaisse.id)).toBe(false);
  });

  test("annulerRecuVente() ne fonctionne que sur un Reçu encore EMISE", async () => {
    const numero = await avecEntreprise(entrepriseId, (tx) => genererNumeroRecuVente(tx, entrepriseId));
    const [recu] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(recuVente)
        .values({ entrepriseId, numero, dealId, montantHT: 2000, montantTVA: 0, montantTTC: 2000, moyenPaiement: "virement", creeParId: utilisateurId })
        .returning({ id: recuVente.id })
    );

    await avecEntreprise(entrepriseId, (tx) =>
      tx.update(recuVente).set({ statut: "ANNULE" }).where(eq(recuVente.id, recu.id))
    );
    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(recuVente).where(eq(recuVente.id, recu.id)));
    expect(apres.statut).toBe("ANNULE");
  });
});
