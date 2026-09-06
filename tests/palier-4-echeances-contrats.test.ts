import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, contrat } from "@/db/schema";
import { verifierEcheancesContrats } from "@/lib/contrats/echeances";

/**
 * Vérifie la double mécanique de docs/palier-4-*, section 3 : un contrat
 * expiré passe automatiquement en EXPIRE, et un contrat qui entre dans sa
 * fenêtre de préavis déclenche une alerte au responsable du Dossier, une
 * seule fois (alerteEcheanceEnvoyeeLe empêche la répétition quotidienne).
 */
describe("Palier 4 — vérification des échéances de contrats", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let dossierId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST P4 Échéances Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-p4-echeances@vertexone.test", nomComplet: "Admin Échéances", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    dossierId = await avecEntreprise(entrepriseId, async (tx) => {
      const [pr] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Échéances", telephone: "+237600000006", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(dossier)
        .values({ entrepriseId, contactId: pr.id, titre: "Dossier Échéances", responsableId: utilisateurId })
        .returning({ id: dossier.id });
      return d.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(contrat).where(eq(contrat.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("un contrat dont la date de fin est dépassée passe en EXPIRE", async () => {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(contrat).values({ entrepriseId, dossierId, titre: "Contrat Expiré", dateDebut: new Date(hier.getTime() - 1000 * 60 * 60 * 24 * 365), dateFin: hier }).returning({ id: contrat.id })
    );

    await avecEntreprise(entrepriseId, (tx) => verifierEcheancesContrats(tx, entrepriseId));

    const [releve] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contrat).where(eq(contrat.id, c.id)));
    expect(releve.statut).toBe("EXPIRE");
  });

  test("un contrat qui entre dans sa fenêtre de préavis déclenche une alerte une seule fois", async () => {
    const dansQuinzeJours = new Date();
    dansQuinzeJours.setDate(dansQuinzeJours.getDate() + 15);

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(contrat)
        .values({ entrepriseId, dossierId, titre: "Contrat Bientôt Échu", dateDebut: new Date(), dateFin: dansQuinzeJours, preavisJours: 30 })
        .returning({ id: contrat.id })
    );

    const premierPassage = await avecEntreprise(entrepriseId, (tx) => verifierEcheancesContrats(tx, entrepriseId));
    expect(premierPassage.some((r) => r.contratId === c.id)).toBe(true);

    const [releve] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contrat).where(eq(contrat.id, c.id)));
    expect(releve.alerteEcheanceEnvoyeeLe).not.toBeNull();
    expect(releve.statut).toBe("ACTIF"); // pas encore expiré, seulement alerté

    const deuxiemePassage = await avecEntreprise(entrepriseId, (tx) => verifierEcheancesContrats(tx, entrepriseId));
    expect(deuxiemePassage.some((r) => r.contratId === c.id)).toBe(false);
  });

  test("un contrat hors fenêtre de préavis n'est pas affecté", async () => {
    const dansUnAn = new Date();
    dansUnAn.setDate(dansUnAn.getDate() + 365);

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(contrat)
        .values({ entrepriseId, dossierId, titre: "Contrat Lointain", dateDebut: new Date(), dateFin: dansUnAn, preavisJours: 30 })
        .returning({ id: contrat.id })
    );

    const resultats = await avecEntreprise(entrepriseId, (tx) => verifierEcheancesContrats(tx, entrepriseId));
    expect(resultats.some((r) => r.contratId === c.id)).toBe(false);

    const [releve] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(contrat).where(eq(contrat.id, c.id)));
    expect(releve.statut).toBe("ACTIF");
    expect(releve.alerteEcheanceEnvoyeeLe).toBeNull();
  });
});
