import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  contact,
  deal,
  produit,
  factureRecurrente,
  ligneFactureRecurrente,
  facture,
  ligneFacture,
  ecritureComptable,
} from "@/db/schema";
import { genererFacturesRecurrentesDues } from "@/lib/facturation/recurrence";

const HIER = new Date(Date.now() - 1000 * 60 * 60 * 24);
const DEMAIN = new Date(Date.now() + 1000 * 60 * 60 * 24);

/**
 * Vérifie genererFacturesRecurrentesDues() (extensions Ventes, Factures
 * récurrentes, échange du 2026-09-07) : génération d'une vraie Facture
 * numérotée pour un modèle ACTIF dû, avance de prochaineDateGeneration
 * depuis la date prévue (jamais depuis "now"), bascule à TERMINE une fois
 * dateFin dépassée, ignore un modèle pas encore dû ou EN_PAUSE, et diffère
 * (sans avancer la date) un modèle dont l'entreprise n'a pas encore de NIU.
 */
describe("Ventes — génération des Factures récurrentes dues", () => {
  let entrepriseAvecNiuId: string;
  let entrepriseSansNiuId: string;
  let utilisateurAId: string;
  let utilisateurBId: string;
  let dealAId: string;
  let dealBId: string;
  let produitId: string;

  beforeAll(async () => {
    const [eA] = await db.insert(entreprise).values({ nom: "TEST FR Génération Avec NIU", secteurProfil: "agence", niu: "M012026000042" }).returning({ id: entreprise.id });
    const [eB] = await db.insert(entreprise).values({ nom: "TEST FR Génération Sans NIU", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseAvecNiuId = eA.id;
    entrepriseSansNiuId = eB.id;

    const [uA] = await db
      .insert(utilisateur)
      .values({ entrepriseId: entrepriseAvecNiuId, email: "admin-fr-gen-a@vertexone.test", nomComplet: "Admin A", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uB] = await db
      .insert(utilisateur)
      .values({ entrepriseId: entrepriseSansNiuId, email: "admin-fr-gen-b@vertexone.test", nomComplet: "Admin B", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurAId = uA.id;
    utilisateurBId = uB.id;

    const [cA, pA] = await avecEntreprise(entrepriseAvecNiuId, async (tx) => {
      const [contactCree] = await tx
        .insert(contact)
        .values({ entrepriseId: entrepriseAvecNiuId, nom: "Contact A", telephone: "+237600000092", assigneAId: utilisateurAId })
        .returning({ id: contact.id });
      const [produitCree] = await tx
        .insert(produit)
        .values({ entrepriseId: entrepriseAvecNiuId, type: "BIEN", nom: "Produit FR Génération", prixVente: 5000, suiviStock: true, stockActuel: 20 })
        .returning({ id: produit.id });
      return [contactCree, produitCree];
    });
    produitId = pA.id;

    const [dA] = await avecEntreprise(entrepriseAvecNiuId, (tx) =>
      tx.insert(deal).values({ entrepriseId: entrepriseAvecNiuId, titre: "Deal A", contactId: cA.id, assigneAId: utilisateurAId }).returning({ id: deal.id })
    );
    dealAId = dA.id;

    const [cB] = await avecEntreprise(entrepriseSansNiuId, (tx) =>
      tx.insert(contact).values({ entrepriseId: entrepriseSansNiuId, nom: "Contact B", telephone: "+237600000093", assigneAId: utilisateurBId }).returning({ id: contact.id })
    );
    const [dB] = await avecEntreprise(entrepriseSansNiuId, (tx) =>
      tx.insert(deal).values({ entrepriseId: entrepriseSansNiuId, titre: "Deal B", contactId: cB.id, assigneAId: utilisateurBId }).returning({ id: deal.id })
    );
    dealBId = dB.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of [entrepriseAvecNiuId, entrepriseSansNiuId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, id));
        await tx.delete(ligneFacture).where(eq(ligneFacture.entrepriseId, id));
        await tx.delete(facture).where(eq(facture.entrepriseId, id));
        await tx.delete(ligneFactureRecurrente).where(eq(ligneFactureRecurrente.entrepriseId, id));
        await tx.delete(factureRecurrente).where(eq(factureRecurrente.entrepriseId, id));
        await tx.delete(produit).where(eq(produit.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurAId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurBId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseAvecNiuId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseSansNiuId));
  }, 30_000);

  test("un modèle ACTIF dû génère une Facture, décrémente le stock, avance la date et équilibre les écritures", async () => {
    const [profil] = await avecEntreprise(entrepriseAvecNiuId, async (tx) => {
      const [p] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: entrepriseAvecNiuId,
          dealId: dealAId,
          libelle: "Abonnement mensuel",
          frequence: "MENSUEL",
          dateDebut: HIER,
          prochaineDateGeneration: HIER,
          montantHT: 10000,
          montantTVA: 1925,
          montantTTC: 11925,
          creeParId: utilisateurAId,
        })
        .returning({ id: factureRecurrente.id, prochaineDateGeneration: factureRecurrente.prochaineDateGeneration });
      await tx.insert(ligneFactureRecurrente).values({
        entrepriseId: entrepriseAvecNiuId,
        factureRecurrenteId: p.id,
        produitId,
        designation: "Produit FR Génération",
        quantite: 2,
        prixUnitaire: 5000,
        tauxTVA: 19.25,
      });
      return [p];
    });

    const resultats = await avecEntreprise(entrepriseAvecNiuId, (tx) => genererFacturesRecurrentesDues(tx, entrepriseAvecNiuId));
    const resultat = resultats.find((r) => r.factureRecurrenteId === profil.id);
    expect(resultat?.genere).toBe(true);
    expect(resultat?.numero).toMatch(/^FAC-\d{4}-\d{6}$/);

    const [profilApres] = await avecEntreprise(entrepriseAvecNiuId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profil.id)));
    expect(profilApres.statut).toBe("ACTIF");
    const attendue = new Date(profil.prochaineDateGeneration);
    attendue.setMonth(attendue.getMonth() + 1);
    expect(profilApres.prochaineDateGeneration.getTime()).toBe(attendue.getTime());

    const lignesFacture = await avecEntreprise(entrepriseAvecNiuId, (tx) => tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, resultat!.factureId!)));
    expect(lignesFacture).toHaveLength(1);
    expect(lignesFacture[0].designation).toBe("Produit FR Génération");

    const [produitApres] = await avecEntreprise(entrepriseAvecNiuId, (tx) => tx.select().from(produit).where(eq(produit.id, produitId)));
    expect(produitApres.stockActuel).toBe(18);

    const ecritures = await avecEntreprise(entrepriseAvecNiuId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseAvecNiuId)));
    const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBeGreaterThan(0);
  });

  test("un modèle dont la prochaine échéance dépasse dateFin bascule à TERMINE après génération", async () => {
    const dansDixJours = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10);
    const [profil] = await avecEntreprise(entrepriseAvecNiuId, async (tx) => {
      const [p] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: entrepriseAvecNiuId,
          dealId: dealAId,
          libelle: "Contrat trimestriel bientôt fini",
          frequence: "TRIMESTRIEL",
          dateDebut: HIER,
          dateFin: dansDixJours,
          prochaineDateGeneration: HIER,
          montantHT: 20000,
          montantTVA: 0,
          montantTTC: 20000,
          creeParId: utilisateurAId,
        })
        .returning({ id: factureRecurrente.id });
      await tx.insert(ligneFactureRecurrente).values({
        entrepriseId: entrepriseAvecNiuId,
        factureRecurrenteId: p.id,
        designation: "Prestation trimestrielle",
        quantite: 1,
        prixUnitaire: 20000,
        tauxTVA: 0,
      });
      return [p];
    });

    const resultats = await avecEntreprise(entrepriseAvecNiuId, (tx) => genererFacturesRecurrentesDues(tx, entrepriseAvecNiuId));
    expect(resultats.find((r) => r.factureRecurrenteId === profil.id)?.genere).toBe(true);

    const [apres] = await avecEntreprise(entrepriseAvecNiuId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profil.id)));
    expect(apres.statut).toBe("TERMINE");
  });

  test("un modèle pas encore dû ou EN_PAUSE n'est jamais traité", async () => {
    const [profilPasDu, profilEnPause] = await avecEntreprise(entrepriseAvecNiuId, async (tx) => {
      const [pasDu] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: entrepriseAvecNiuId,
          dealId: dealAId,
          libelle: "Pas encore dû",
          frequence: "MENSUEL",
          dateDebut: DEMAIN,
          prochaineDateGeneration: DEMAIN,
          montantHT: 5000,
          montantTVA: 0,
          montantTTC: 5000,
          creeParId: utilisateurAId,
        })
        .returning({ id: factureRecurrente.id });
      const [enPause] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: entrepriseAvecNiuId,
          dealId: dealAId,
          libelle: "En pause",
          statut: "EN_PAUSE",
          frequence: "MENSUEL",
          dateDebut: HIER,
          prochaineDateGeneration: HIER,
          montantHT: 5000,
          montantTVA: 0,
          montantTTC: 5000,
          creeParId: utilisateurAId,
        })
        .returning({ id: factureRecurrente.id });
      return [pasDu, enPause];
    });

    const resultats = await avecEntreprise(entrepriseAvecNiuId, (tx) => genererFacturesRecurrentesDues(tx, entrepriseAvecNiuId));
    expect(resultats.some((r) => r.factureRecurrenteId === profilPasDu.id)).toBe(false);
    expect(resultats.some((r) => r.factureRecurrenteId === profilEnPause.id)).toBe(false);
  });

  test("sans NIU sur l'entreprise, la génération est différée sans avancer la date", async () => {
    const [profil] = await avecEntreprise(entrepriseSansNiuId, async (tx) => {
      const [p] = await tx
        .insert(factureRecurrente)
        .values({
          entrepriseId: entrepriseSansNiuId,
          dealId: dealBId,
          libelle: "Abonnement sans NIU",
          frequence: "MENSUEL",
          dateDebut: HIER,
          prochaineDateGeneration: HIER,
          montantHT: 8000,
          montantTVA: 0,
          montantTTC: 8000,
          creeParId: utilisateurBId,
        })
        .returning({ id: factureRecurrente.id, prochaineDateGeneration: factureRecurrente.prochaineDateGeneration });
      await tx.insert(ligneFactureRecurrente).values({
        entrepriseId: entrepriseSansNiuId,
        factureRecurrenteId: p.id,
        designation: "Prestation sans NIU",
        quantite: 1,
        prixUnitaire: 8000,
        tauxTVA: 0,
      });
      return [p];
    });

    const resultats = await avecEntreprise(entrepriseSansNiuId, (tx) => genererFacturesRecurrentesDues(tx, entrepriseSansNiuId));
    const resultat = resultats.find((r) => r.factureRecurrenteId === profil.id);
    expect(resultat?.genere).toBe(false);
    expect(resultat?.erreur).toBe("NIU manquant");

    const [apres] = await avecEntreprise(entrepriseSansNiuId, (tx) => tx.select().from(factureRecurrente).where(eq(factureRecurrente.id, profil.id)));
    expect(apres.statut).toBe("ACTIF");
    expect(apres.prochaineDateGeneration.getTime()).toBe(new Date(profil.prochaineDateGeneration).getTime());
  });
});
