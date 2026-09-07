import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, projet, minuteurActif, entreeTemps } from "@/db/schema";

/**
 * Vérifie la logique métier du minuteur démarrer/arrêter (échange du
 * 2026-09-07) : un seul minuteur actif par utilisateur (contrainte unique en
 * base), l'arrêt calcule correctement la durée écoulée et crée l'entrée de
 * temps correspondante, l'annulation supprime sans rien créer.
 *
 * Comme genererFactureDepuisHeures() (voir suivi-heures-logique.test.ts),
 * les actions de src/lib/actions/minuteur.ts vérifient la session via
 * recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
 * dans ce test. On reproduit donc directement la même séquence de mutations
 * que chaque action.
 */
describe("Minuteur démarrer/arrêter — logique métier", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let projetId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Minuteur Logique", secteurProfil: "agence", niu: "M012026000099" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-minuteur-logique@vertexone.test", nomComplet: "Admin Minuteur Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [p] = await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Contact Minuteur Logique", telephone: "+237600000098", assigneAId: utilisateurId }).returning({ id: contact.id });
      const [d] = await tx.insert(dossier).values({ entrepriseId, contactId: c.id, titre: "Dossier Minuteur Logique", responsableId: utilisateurId }).returning({ id: dossier.id });
      return tx
        .insert(projet)
        .values({ entrepriseId, dossierId: d.id, titre: "Projet Minuteur Logique", responsablePrincipalId: utilisateurId, tauxHoraireParDefaut: 5000 })
        .returning({ id: projet.id });
    });
    projetId = p.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(minuteurActif).where(eq(minuteurActif.entrepriseId, entrepriseId));
      await tx.delete(entreeTemps).where(eq(entreeTemps.entrepriseId, entrepriseId));
      await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("démarrer crée une ligne ; un deuxième démarrage pour le même utilisateur est refusé (garde applicative + contrainte unique)", async () => {
    const [demarre] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(minuteurActif).values({ entrepriseId, utilisateurId, projetId }).returning({ id: minuteurActif.id })
    );
    expect(demarre.id).toBeDefined();

    // Reproduit la garde applicative de demarrerMinuteur() : un select avant
    // insert détecte la ligne existante et refuse plutôt que d'insérer.
    const [existant] = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: minuteurActif.id }).from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurId)));
    expect(existant).toBeDefined();

    // Filet de sécurité en base : même en contournant la garde applicative,
    // un deuxième insert pour le même utilisateur viole la contrainte unique.
    await expect(
      avecEntreprise(entrepriseId, (tx) => tx.insert(minuteurActif).values({ entrepriseId, utilisateurId, projetId }))
    ).rejects.toThrow();

    await avecEntreprise(entrepriseId, (tx) => tx.delete(minuteurActif).where(eq(minuteurActif.id, demarre.id)));
  });

  test("arrêter calcule la durée écoulée et crée l'entrée de temps correspondante, puis supprime le minuteur", async () => {
    const demarreLe = new Date(Date.now() - 90 * 60 * 1000); // il y a 1h30
    const [actif] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(minuteurActif).values({ entrepriseId, utilisateurId, projetId, demarreLe, note: "Session de travail" }).returning()
    );

    // Reproduit exactement le calcul d'arreterMinuteur().
    const idEntree = await avecEntreprise(entrepriseId, async (tx) => {
      const [leProjet] = await tx.select({ tauxHoraireParDefaut: projet.tauxHoraireParDefaut }).from(projet).where(eq(projet.id, actif.projetId));
      const heuresEcoulees = (Date.now() - actif.demarreLe.getTime()) / 3_600_000;
      const dureeHeures = Math.max(0.01, Math.round(heuresEcoulees * 100) / 100);

      const [entree] = await tx
        .insert(entreeTemps)
        .values({
          entrepriseId,
          projetId: actif.projetId,
          tacheId: actif.tacheId,
          utilisateurId,
          date: actif.demarreLe,
          dureeHeures,
          tauxHoraire: leProjet?.tauxHoraireParDefaut ?? 0,
          facturable: true,
          note: actif.note,
        })
        .returning({ id: entreeTemps.id });

      await tx.delete(minuteurActif).where(eq(minuteurActif.id, actif.id));
      return entree.id;
    });

    const [entreeCreee] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.id, idEntree)));
    expect(entreeCreee.dureeHeures).toBeCloseTo(1.5, 1);
    expect(entreeCreee.tauxHoraire).toBe(5000);
    expect(entreeCreee.facturable).toBe(true);
    expect(entreeCreee.note).toBe("Session de travail");

    const [minuteurRestant] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurId)));
    expect(minuteurRestant).toBeUndefined();
  });

  test("un arrêt quasi immédiat plafonne la durée à 0.01h (jamais 0, qui violerait la contrainte positive)", async () => {
    const demarreLe = new Date(); // à l'instant
    const heuresEcoulees = (Date.now() - demarreLe.getTime()) / 3_600_000;
    const dureeHeures = Math.max(0.01, Math.round(heuresEcoulees * 100) / 100);
    expect(dureeHeures).toBe(0.01);
  });

  test("annuler supprime le minuteur sans créer d'entrée de temps", async () => {
    const [actif] = await avecEntreprise(entrepriseId, (tx) => tx.insert(minuteurActif).values({ entrepriseId, utilisateurId, projetId }).returning());

    const avantAnnulation = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.utilisateurId, utilisateurId)));

    // Reproduit annulerMinuteur().
    const [supprime] = await avecEntreprise(entrepriseId, (tx) =>
      tx.delete(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurId)).returning({ projetId: minuteurActif.projetId })
    );
    expect(supprime.projetId).toBe(actif.projetId);

    const apresAnnulation = await avecEntreprise(entrepriseId, (tx) => tx.select().from(entreeTemps).where(eq(entreeTemps.utilisateurId, utilisateurId)));
    expect(apresAnnulation.length).toBe(avantAnnulation.length);

    const [minuteurRestant] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurId)));
    expect(minuteurRestant).toBeUndefined();
  });
});
