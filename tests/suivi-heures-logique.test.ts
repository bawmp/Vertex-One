import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, tache, entreeTemps, facture, ligneFacture, ecritureComptable } from "@/db/schema";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { resoudreClientVente } from "@/lib/facturation/client-document";

/**
 * Vérifie la logique métier de genererFactureDepuisHeures() (Suivi des
 * heures, échange du 2026-09-07) : seules les entrées facturables non
 * encore facturées alimentent la Facture, une entrée déjà facturée ne peut
 * jamais être facturée une seconde fois, les entrées non facturables
 * restent toujours de côté, et le client est bien retrouvé via
 * projet.dossierId → dossier.contactId (Projet n'a pas de contactId propre).
 *
 * genererFactureDepuisHeures() vérifie la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test. On reproduit donc directement la même séquence de mutations
 * que l'action, comme les autres tests de logique métier de ce projet.
 */
describe("Suivi des heures — génération d'une Facture depuis les heures", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let contactId: string;
  let projetId: string;
  let tacheId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Heures Logique", secteurProfil: "agence", niu: "M012026000088" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-heures-logique@vertexone.test", nomComplet: "Admin Heures Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c, p, t] = await avecEntreprise(entrepriseId, async (tx) => {
      const [contactCree] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Contact Heures Logique", telephone: "+237600000099", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [dossierCree] = await tx
        .insert(dossier)
        .values({ entrepriseId, contactId: contactCree.id, titre: "Dossier Heures Logique", responsableId: utilisateurId })
        .returning({ id: dossier.id });
      const [projetCree] = await tx
        .insert(projet)
        .values({ entrepriseId, dossierId: dossierCree.id, titre: "Projet Heures Logique", responsablePrincipalId: utilisateurId, tauxHoraireParDefaut: 4000 })
        .returning({ id: projet.id });
      const [tacheCreee] = await tx
        .insert(tache)
        .values({ entrepriseId, projetId: projetCree.id, titre: "Développement", assigneAId: utilisateurId, creeParId: utilisateurId })
        .returning({ id: tache.id });
      return [contactCree, projetCree, tacheCreee];
    });
    contactId = c.id;
    projetId = p.id;
    tacheId = t.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(ligneFacture).where(eq(ligneFacture.entrepriseId, entrepriseId));
      // entree_temps.factureId référence facture — à supprimer avant, même
      // bug déjà rencontré ailleurs dans ce projet (voir CLAUDE.md).
      await tx.delete(entreeTemps).where(eq(entreeTemps.entrepriseId, entrepriseId));
      await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
      await tx.delete(tache).where(eq(tache.entrepriseId, entrepriseId));
      await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("génère une Facture depuis les heures facturables non facturées, ignore le reste, et empêche la double-facturation", async () => {
    const [entreeFacturable, entreeNonFacturable] = await avecEntreprise(entrepriseId, async (tx) => {
      const [e1] = await tx
        .insert(entreeTemps)
        .values({ entrepriseId, projetId, tacheId, utilisateurId, date: new Date(), dureeHeures: 4, tauxHoraire: 4000, facturable: true, note: "Développement du module X" })
        .returning({ id: entreeTemps.id });
      const [e2] = await tx
        .insert(entreeTemps)
        .values({ entrepriseId, projetId, utilisateurId, date: new Date(), dureeHeures: 2, tauxHoraire: 0, facturable: false })
        .returning({ id: entreeTemps.id });
      return [e1, e2];
    });

    const idFacture = await avecEntreprise(entrepriseId, async (tx) => {
      const [leProjet] = await tx.select().from(projet).where(eq(projet.id, projetId));
      const [leDossier] = await tx.select().from(dossier).where(eq(dossier.id, leProjet.dossierId));
      const entrees = await tx.select().from(entreeTemps).where(and(eq(entreeTemps.projetId, projetId), eq(entreeTemps.facturable, true), isNull(entreeTemps.factureId)));
      expect(entrees).toHaveLength(1);
      expect(entrees[0].id).toBe(entreeFacturable.id);

      const client = await resoudreClientVente(tx, { utilisateurId, entrepriseId, role: "ADMIN" }, { contactId: leDossier.contactId });
      expect(client).not.toBeNull();

      const lignes = entrees.map((e) => ({ designation: e.note ?? "Heures travaillées", quantite: e.dureeHeures, prixUnitaire: e.tauxHoraire, tauxTVA: 19.25 }));
      const montants = calculerMontants(lignes);

      const numero = await genererNumeroFacture(tx, entrepriseId);
      const dateEcheance = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

      const [nouvelleFacture] = await tx
        .insert(facture)
        .values({ entrepriseId, numero, contactId: client!.contactId, compteId: client!.compteId, assigneAId: client!.assigneAId, montantHT: montants.montantHT, montantTVA: montants.montantTVA, montantTTC: montants.montantTTC, dateEcheance })
        .returning({ id: facture.id });

      await tx.insert(ligneFacture).values(lignes.map((l) => ({ entrepriseId, factureId: nouvelleFacture.id, designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTVA: l.tauxTVA })));
      await tx.update(entreeTemps).set({ factureId: nouvelleFacture.id }).where(inArray(entreeTemps.id, entrees.map((e) => e.id)));
      await genererEcrituresFactureEmise(tx, { id: nouvelleFacture.id, entrepriseId, numero, dateEmission: new Date(), montantHT: montants.montantHT, montantTVA: montants.montantTVA, montantTTC: montants.montantTTC });

      return nouvelleFacture.id;
    });

    // Montant attendu : 4h × 4000 FCFA = 16000 HT, + 19.25% TVA = 3080 → 19080 TTC.
    const [laFacture] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, idFacture)));
    expect(laFacture.montantHT).toBe(16000);
    expect(laFacture.montantTTC).toBe(19080);
    expect(laFacture.contactId).toBe(contactId);

    const [entreeFacturableApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entreeFacturable.id)));
    expect(entreeFacturableApres.factureId).toBe(idFacture);

    const [entreeNonFacturableApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entreeNonFacturable.id)));
    expect(entreeNonFacturableApres.factureId).toBeNull();

    // Un deuxième passage ne doit plus rien trouver à facturer (déjà facturée).
    const entreesRestantes = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(entreeTemps).where(and(eq(entreeTemps.projetId, projetId), eq(entreeTemps.facturable, true), isNull(entreeTemps.factureId)))
    );
    expect(entreesRestantes).toHaveLength(0);

    const ecritures = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId)));
    const totalDebit = ecritures.reduce((s, e) => s + e.debit, 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.credit, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBeGreaterThan(0);
  });

  test("une entrée déjà facturée ne peut plus être supprimée (garde applicative de supprimerEntreeTemps)", async () => {
    const [entree] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(entreeTemps).values({ entrepriseId, projetId, utilisateurId, date: new Date(), dureeHeures: 1, tauxHoraire: 1000 }).returning({ id: entreeTemps.id })
    );
    await avecEntreprise(entrepriseId, async (tx) => {
      const numero = await genererNumeroFacture(tx, entrepriseId);
      const [f] = await tx
        .insert(facture)
        .values({ entrepriseId, numero, contactId, assigneAId: utilisateurId, dateEcheance: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), montantHT: 1000, montantTVA: 0, montantTTC: 1000 })
        .returning({ id: facture.id });
      await tx.update(entreeTemps).set({ factureId: f.id }).where(eq(entreeTemps.id, entree.id));
    });

    // Reproduit le WHERE exact de supprimerEntreeTemps() : ne cible que les
    // entrées sans factureId.
    const supprimee = await avecEntreprise(entrepriseId, (tx) =>
      tx.delete(entreeTemps).where(and(eq(entreeTemps.id, entree.id), isNull(entreeTemps.factureId))).returning({ id: entreeTemps.id })
    );
    expect(supprimee).toHaveLength(0);

    const [toujoursLa] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, entree.id)));
    expect(toujoursLa).toBeDefined();
  });
});
