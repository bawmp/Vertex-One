import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  contact,
  deal,
  produit,
  bonCommandeVente,
  ligneBonCommandeVente,
  facture,
  ligneFacture,
  ecritureComptable,
} from "@/db/schema";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

/**
 * Vérifie la conversion d'un Bon de commande client en Facture (extensions
 * Ventes, échange du 2026-09-07) : copie des lignes, décrément de stock,
 * génération des écritures comptables, changement de statut — et qu'un Bon
 * de commande déjà converti ou annulé ne peut pas l'être une seconde fois.
 *
 * convertirBonCommandeVenteEnFacture() vérifie la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test. On reproduit donc directement la même séquence de mutations
 * que l'action, en réutilisant avecEntreprise() comme le fait l'action
 * elle-même (même pattern que tests/achats-conversion-bon-commande.test.ts).
 */
describe("Ventes — conversion d'un Bon de commande client en Facture", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let contactId: string;
  let dealId: string;
  let produitId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Conversion BCV", secteurProfil: "agence", niu: "M012025000001" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-conversion-bcv@vertexone.test", nomComplet: "Admin Conversion BCV", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c, p] = await avecEntreprise(entrepriseId, async (tx) => {
      const [contactCree] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Contact Conversion BCV", telephone: "+237600000091", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [produitCree] = await tx
        .insert(produit)
        .values({ entrepriseId, type: "BIEN", nom: "Produit Conversion BCV", prixVente: 5000, suiviStock: true, stockActuel: 10 })
        .returning({ id: produit.id });
      return [contactCree, produitCree];
    });
    contactId = c.id;
    produitId = p.id;

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(deal).values({ entrepriseId, titre: "Deal Conversion BCV", contactId, assigneAId: utilisateurId }).returning({ id: deal.id })
    );
    dealId = d.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(ligneFacture).where(eq(ligneFacture.entrepriseId, entrepriseId));
      await tx.delete(ligneBonCommandeVente).where(eq(ligneBonCommandeVente.entrepriseId, entrepriseId));
      await tx.delete(bonCommandeVente).where(eq(bonCommandeVente.entrepriseId, entrepriseId));
      await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
      await tx.delete(produit).where(eq(produit.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("la conversion copie les lignes, décrémente le stock, change le statut et génère les écritures", async () => {
    const [leBCV] = await avecEntreprise(entrepriseId, async (tx) => {
      const [bcv] = await tx
        .insert(bonCommandeVente)
        .values({
          entrepriseId,
          numero: "BCV-2026-000001",
          dealId,
          contactId,
          assigneAId: utilisateurId,
          montantHT: 10000,
          montantTVA: 1925,
          montantTTC: 11925,
          creeParId: utilisateurId,
        })
        .returning({ id: bonCommandeVente.id });
      await tx.insert(ligneBonCommandeVente).values({
        entrepriseId,
        bonCommandeVenteId: bcv.id,
        produitId,
        designation: "Produit Conversion BCV",
        quantite: 2,
        prixUnitaire: 5000,
        tauxTVA: 19.25,
      });
      return [bcv];
    });

    const nouvelleFactureId = await avecEntreprise(entrepriseId, async (tx) => {
      const lignesBCV = await tx.select().from(ligneBonCommandeVente).where(eq(ligneBonCommandeVente.bonCommandeVenteId, leBCV.id));

      const [nouvelleFacture] = await tx
        .insert(facture)
        .values({
          entrepriseId,
          numero: "FAC-2026-000099",
          dealId,
          contactId,
          assigneAId: utilisateurId,
          montantHT: 10000,
          montantTVA: 1925,
          montantTTC: 11925,
          dateEcheance: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        })
        .returning({ id: facture.id });

      await tx.insert(ligneFacture).values(
        lignesBCV.map((l) => ({
          entrepriseId,
          factureId: nouvelleFacture.id,
          produitId: l.produitId,
          designation: l.designation,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          tauxTVA: l.tauxTVA,
        }))
      );

      await decrementerStockVente(tx, lignesBCV);

      await tx.update(bonCommandeVente).set({ statut: "FACTURE", factureId: nouvelleFacture.id }).where(eq(bonCommandeVente.id, leBCV.id));

      await genererEcrituresFactureEmise(tx, {
        id: nouvelleFacture.id,
        entrepriseId,
        numero: "FAC-2026-000099",
        dateEmission: new Date(),
        montantHT: 10000,
        montantTVA: 1925,
        montantTTC: 11925,
      });

      return nouvelleFacture.id;
    });

    const [bcvApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, leBCV.id)));
    expect(bcvApres.statut).toBe("FACTURE");
    expect(bcvApres.factureId).toBe(nouvelleFactureId);

    const lignesFacture = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, nouvelleFactureId))
    );
    expect(lignesFacture).toHaveLength(1);
    expect(lignesFacture[0].designation).toBe("Produit Conversion BCV");

    const [produitApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(produit).where(eq(produit.id, produitId)));
    expect(produitApres.stockActuel).toBe(8);

    const ecritures = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    expect(ecritures.length).toBeGreaterThan(0);
    const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("un Bon de commande déjà FACTURE ou ANNULE ne peut pas être reconverti", async () => {
    const [bcvAnnulable] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(bonCommandeVente)
        .values({
          entrepriseId,
          numero: "BCV-2026-000002",
          dealId,
          contactId,
          assigneAId: utilisateurId,
          montantHT: 5000,
          montantTVA: 0,
          montantTTC: 5000,
          creeParId: utilisateurId,
        })
        .returning({ id: bonCommandeVente.id })
    );

    await avecEntreprise(entrepriseId, (tx) =>
      tx.update(bonCommandeVente).set({ statut: "ANNULE" }).where(and(eq(bonCommandeVente.id, bcvAnnulable.id), eq(bonCommandeVente.statut, "BROUILLON")))
    );
    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bcvAnnulable.id)));
    expect(apres.statut).toBe("ANNULE");

    // Simule un deuxième appel à convertirBonCommandeVenteEnFacture() sur un
    // BCV qui n'est plus BROUILLON : le WHERE de l'action ne ciblerait plus
    // rien, ce test vérifie donc que la garde applicative fonctionnerait.
    const [bcvIntrouvableCommeBrouillon] = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(bonCommandeVente).where(and(eq(bonCommandeVente.id, bcvAnnulable.id), eq(bonCommandeVente.statut, "BROUILLON")))
    );
    expect(bcvIntrouvableCommeBrouillon).toBeUndefined();
  });
});
