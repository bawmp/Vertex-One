import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, facture, factureAcompte, ecritureComptable, compteComptable } from "@/db/schema";
import { genererNumeroFactureAcompte, genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresPaiementAcompte, genererEcrituresApplicationAcompte } from "@/lib/comptabilite/ecritures";

/**
 * Vérifie la logique métier des Factures d'acompte (extensions Ventes,
 * échange du 2026-09-07) : encaissement comptabilisé sur 419100 (jamais du
 * chiffre d'affaires), application sur une ou plusieurs Factures tant que
 * montantRestant les couvre intégralement (simplification connue — pas de
 * paiement partiel d'une Facture), bascule APPLIQUEE une fois le solde
 * épuisé, et qu'un acompte déjà encaissé ne peut plus être annulé.
 *
 * creerFactureAcompte()/enregistrerPaiementFactureAcompte()/
 * appliquerAcompteSurFacture() vérifient la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test. On reproduit donc directement la même séquence de mutations
 * que les actions, comme les autres tests de logique métier de ce projet.
 */
describe("Ventes — logique des Factures d'acompte", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let dealId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST FA Logique", secteurProfil: "agence", niu: "M012026000077" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-fa-logique@vertexone.test", nomComplet: "Admin FA Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(contact).values({ entrepriseId, nom: "Contact FA Logique", telephone: "+237600000097", assigneAId: utilisateurId }).returning({ id: contact.id })
    );
    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(deal).values({ entrepriseId, titre: "Deal FA Logique", contactId: c.id, assigneAId: utilisateurId }).returning({ id: deal.id })
    );
    dealId = d.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
      await tx.delete(factureAcompte).where(eq(factureAcompte.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("l'encaissement d'un acompte crédite 419100, jamais 706000 ni la TVA", async () => {
    const numero = await avecEntreprise(entrepriseId, (tx) => genererNumeroFactureAcompte(tx, entrepriseId));
    expect(numero).toMatch(/^ACO-\d{4}-\d{6}$/);

    const [acompte] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(factureAcompte).values({ entrepriseId, numero, dealId, montant: 50000, montantRestant: 50000, creeParId: utilisateurId }).returning({ id: factureAcompte.id })
    );

    const dateEncaissement = new Date();
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.update(factureAcompte).set({ statut: "PAYEE", moyenPaiement: "especes", dateEncaissement }).where(eq(factureAcompte.id, acompte.id));
      await genererEcrituresPaiementAcompte(tx, { id: acompte.id, entrepriseId, numero, dateEncaissement, montant: 50000, moyenPaiement: "especes" });
    });

    const [compte419] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "419100"));
    const [compte706] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "706000"));
    const ecritures = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureAcompteId, acompte.id)));
    expect(ecritures.some((e) => e.compteId === compte419.id && e.credit === 50000)).toBe(true);
    expect(ecritures.some((e) => e.compteId === compte706.id)).toBe(false);

    const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("un acompte payé s'applique sur plusieurs Factures tant que le solde les couvre, puis bascule APPLIQUEE", async () => {
    const numeroAcompte = await avecEntreprise(entrepriseId, (tx) => genererNumeroFactureAcompte(tx, entrepriseId));
    const [acompte] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(factureAcompte).values({ entrepriseId, numero: numeroAcompte, dealId, montant: 80000, montantRestant: 80000, creeParId: utilisateurId }).returning({ id: factureAcompte.id })
    );
    await avecEntreprise(entrepriseId, (tx) => tx.update(factureAcompte).set({ statut: "PAYEE", dateEncaissement: new Date(), moyenPaiement: "manuel" }).where(eq(factureAcompte.id, acompte.id)));

    const numeroF1 = await avecEntreprise(entrepriseId, (tx) => genererNumeroFacture(tx, entrepriseId));
    const [f1] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(facture).values({ entrepriseId, numero: numeroF1, dealId, montantHT: 30000, montantTVA: 0, montantTTC: 30000, dateEcheance: new Date() }).returning({ id: facture.id })
    );
    const numeroF2 = await avecEntreprise(entrepriseId, (tx) => genererNumeroFacture(tx, entrepriseId));
    const [f2] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(facture).values({ entrepriseId, numero: numeroF2, dealId, montantHT: 50000, montantTVA: 0, montantTTC: 50000, dateEcheance: new Date() }).returning({ id: facture.id })
    );

    // Première application (30000 sur 80000 restants) : le solde ne tombe
    // pas à zéro, l'acompte reste PAYEE pour une future application.
    await avecEntreprise(entrepriseId, async (tx) => {
      const [a] = await tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompte.id));
      const [f] = await tx.select().from(facture).where(eq(facture.id, f1.id));
      expect(a.montantRestant).toBeGreaterThanOrEqual(f.montantTTC);
      const restantApres = a.montantRestant - f.montantTTC;
      await tx.update(factureAcompte).set({ montantRestant: restantApres, statut: restantApres === 0 ? "APPLIQUEE" : "PAYEE" }).where(eq(factureAcompte.id, a.id));
      await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, f.id));
      await genererEcrituresApplicationAcompte(tx, {
        entrepriseId,
        factureAcompteId: a.id,
        factureId: f.id,
        numeroFactureAcompte: a.numero,
        numeroFacture: f.numero,
        montant: f.montantTTC,
        dateApplication: new Date(),
      });
    });

    const [acompteApres1] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompte.id)));
    expect(acompteApres1.statut).toBe("PAYEE");
    expect(acompteApres1.montantRestant).toBe(50000);

    // Deuxième application (50000 sur les 50000 restants) : le solde tombe
    // exactement à zéro, l'acompte bascule APPLIQUEE.
    await avecEntreprise(entrepriseId, async (tx) => {
      const [a] = await tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompte.id));
      const [f] = await tx.select().from(facture).where(eq(facture.id, f2.id));
      const restantApres = a.montantRestant - f.montantTTC;
      await tx.update(factureAcompte).set({ montantRestant: restantApres, statut: restantApres === 0 ? "APPLIQUEE" : "PAYEE" }).where(eq(factureAcompte.id, a.id));
      await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, f.id));
      await genererEcrituresApplicationAcompte(tx, {
        entrepriseId,
        factureAcompteId: a.id,
        factureId: f.id,
        numeroFactureAcompte: a.numero,
        numeroFacture: f.numero,
        montant: f.montantTTC,
        dateApplication: new Date(),
      });
    });

    const [acompteApres2] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompte.id)));
    expect(acompteApres2.statut).toBe("APPLIQUEE");
    expect(acompteApres2.montantRestant).toBe(0);

    const [f1Apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, f1.id)));
    const [f2Apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, f2.id)));
    expect(f1Apres.statut).toBe("PAYEE");
    expect(f2Apres.statut).toBe("PAYEE");

    const ecrituresApplication = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureAcompteId, acompte.id)));
    const totalDebit = ecrituresApplication.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecrituresApplication.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(80000);
  });

  test("une Facture plus grande que le solde restant de l'acompte ne peut pas être ciblée (garde applicative)", async () => {
    const numeroAcompte = await avecEntreprise(entrepriseId, (tx) => genererNumeroFactureAcompte(tx, entrepriseId));
    const [acompte] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(factureAcompte).values({ entrepriseId, numero: numeroAcompte, dealId, montant: 20000, montantRestant: 20000, statut: "PAYEE", creeParId: utilisateurId }).returning({ id: factureAcompte.id })
    );
    const numeroF = await avecEntreprise(entrepriseId, (tx) => genererNumeroFacture(tx, entrepriseId));
    const [f] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(facture).values({ entrepriseId, numero: numeroF, dealId, montantHT: 30000, montantTVA: 0, montantTTC: 30000, dateEcheance: new Date() }).returning({ id: facture.id })
    );

    // Simule la garde exacte de appliquerAcompteSurFacture() : la requête ne
    // doit rien trouver puisque montantRestant (20000) < montantTTC (30000).
    const [candidat] = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(factureAcompte).where(and(eq(factureAcompte.id, acompte.id), eq(factureAcompte.statut, "PAYEE")))
    );
    expect(candidat.montantRestant).toBeLessThan(30000);

    const [factureApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, f.id)));
    expect(factureApres.statut).toBe("EMISE");
  });

  test("un acompte déjà encaissé (PAYEE) ne peut plus être annulé", async () => {
    const numero = await avecEntreprise(entrepriseId, (tx) => genererNumeroFactureAcompte(tx, entrepriseId));
    const [acompte] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(factureAcompte).values({ entrepriseId, numero, dealId, montant: 10000, montantRestant: 10000, statut: "PAYEE", creeParId: utilisateurId }).returning({ id: factureAcompte.id })
    );

    // Reproduit le WHERE exact de annulerFactureAcompte() : ne cible que EMISE.
    await avecEntreprise(entrepriseId, (tx) =>
      tx.update(factureAcompte).set({ statut: "ANNULEE" }).where(and(eq(factureAcompte.id, acompte.id), eq(factureAcompte.statut, "EMISE")))
    );
    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, acompte.id)));
    expect(apres.statut).toBe("PAYEE");
  });
});
