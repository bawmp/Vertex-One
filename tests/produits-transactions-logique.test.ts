import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  contact,
  produit,
  devis,
  ligneDevis,
  facture,
  ligneFacture,
  fournisseur,
  compteComptable,
  factureFournisseur,
  ligneFactureFournisseur,
} from "@/db/schema";
import { recupererTransactionsProduit } from "@/lib/produits/transactions";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Vérifie recupererTransactionsProduit() (fiche détail Produit, échange du
 * 2026-09-08) : agrégation d'un produit utilisé à la fois côté Ventes
 * (Devis, Facture) et côté Achats (Facture fournisseur), tri par date
 * décroissante, et absence de faux positif pour un produit jamais utilisé.
 */
describe("Produits — Transactions (agrégation multi-tables)", () => {
  let entrepriseId: string;
  let utilisateurConnecte: UtilisateurConnecte;
  let produitUtiliseId: string;
  let produitInutiliseId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Produits Transactions", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-produits-transactions@vertexone.test", nomComplet: "Admin Transactions", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurConnecte = { utilisateurId: u.id, entrepriseId, role: "ADMIN" };

    const [compteCharge] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 6)).limit(1);

    await avecEntreprise(entrepriseId, async (tx) => {
      const [leContact] = await tx.insert(contact).values({ entrepriseId, nom: "Contact Transactions", telephone: "+237600000077", assigneAId: u.id }).returning({ id: contact.id });
      const [leFournisseur] = await tx.insert(fournisseur).values({ entrepriseId, nom: "Fournisseur Transactions", telephone: "+237600000078" }).returning({ id: fournisseur.id });

      const [pUtilise] = await tx
        .insert(produit)
        .values({ entrepriseId, nom: "Produit Utilisé", prixVente: 10000, creeParId: u.id })
        .returning({ id: produit.id });
      const [pInutilise] = await tx
        .insert(produit)
        .values({ entrepriseId, nom: "Produit Inutilisé", prixVente: 5000, creeParId: u.id })
        .returning({ id: produit.id });
      produitUtiliseId = pUtilise.id;
      produitInutiliseId = pInutilise.id;

      // Devis (plus ancien) et Facture (plus récente) côté Ventes, Facture
      // fournisseur côté Achats — trois branches distinctes de l'union.
      const [leDevis] = await tx
        .insert(devis)
        .values({ entrepriseId, numero: "DEV-TRANS-0001", contactId: leContact.id, assigneAId: u.id, creeParId: u.id, dateValidite: new Date("2026-02-01"), montantHT: 10000, montantTVA: 1925, montantTTC: 11925, creeLe: new Date("2026-01-01") })
        .returning({ id: devis.id });
      await tx.insert(ligneDevis).values({ entrepriseId, devisId: leDevis.id, produitId: produitUtiliseId, designation: "Produit Utilisé", quantite: 1, prixUnitaire: 10000 });

      const [laFacture] = await tx
        .insert(facture)
        .values({ entrepriseId, numero: "FAC-TRANS-0001", contactId: leContact.id, assigneAId: u.id, dateEmission: new Date("2026-03-01"), dateEcheance: new Date("2026-04-01"), montantHT: 20000, montantTVA: 3850, montantTTC: 23850 })
        .returning({ id: facture.id });
      await tx.insert(ligneFacture).values({ entrepriseId, factureId: laFacture.id, produitId: produitUtiliseId, designation: "Produit Utilisé", quantite: 2, prixUnitaire: 10000 });

      const [laFactureFournisseur] = await tx
        .insert(factureFournisseur)
        .values({ entrepriseId, numero: "FF-TRANS-0001", fournisseurId: leFournisseur.id, compteComptableId: compteCharge.id, dateFacture: new Date("2026-02-15"), dateEcheance: new Date("2026-03-15"), montantHT: 8000, montantTVA: 0, montantTTC: 8000, assigneAId: u.id, creeParId: u.id })
        .returning({ id: factureFournisseur.id });
      await tx.insert(ligneFactureFournisseur).values({ entrepriseId, factureFournisseurId: laFactureFournisseur.id, produitId: produitUtiliseId, designation: "Produit Utilisé", quantite: 1, prixUnitaire: 8000 });
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ligneFactureFournisseur).where(eq(ligneFactureFournisseur.entrepriseId, entrepriseId));
      await tx.delete(factureFournisseur).where(eq(factureFournisseur.entrepriseId, entrepriseId));
      await tx.delete(ligneFacture).where(eq(ligneFacture.entrepriseId, entrepriseId));
      await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
      await tx.delete(ligneDevis).where(eq(ligneDevis.entrepriseId, entrepriseId));
      await tx.delete(devis).where(eq(devis.entrepriseId, entrepriseId));
      await tx.delete(fournisseur).where(eq(fournisseur.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
      await tx.delete(produit).where(eq(produit.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurConnecte.utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("agrège Devis/Facture/Facture fournisseur pour un produit utilisé, triés par date décroissante", async () => {
    const transactions = await avecEntreprise(entrepriseId, (tx) => recupererTransactionsProduit(tx, utilisateurConnecte, produitUtiliseId));

    expect(transactions).toHaveLength(3);
    expect(transactions.map((t) => t.type)).toEqual(["Facture", "Facture fournisseur", "Devis"]);
    expect(transactions.find((t) => t.type === "Devis")?.numero).toBe("DEV-TRANS-0001");
    expect(transactions.find((t) => t.type === "Facture")?.montantLigne).toBe(20000);
    expect(transactions.find((t) => t.type === "Facture fournisseur")?.lien).toBe("/app/achats#factures-fournisseurs");
  });

  test("un produit jamais utilisé ne renvoie aucune transaction (pas de faux positif)", async () => {
    const transactions = await avecEntreprise(entrepriseId, (tx) => recupererTransactionsProduit(tx, utilisateurConnecte, produitInutiliseId));
    expect(transactions).toHaveLength(0);
  });
});
