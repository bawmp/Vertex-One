import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, dossier, projet, devis, canal } from "@/db/schema";
import { creerProjetDepuisDevisAccepte } from "@/lib/projets/pont";

// devisOrigineId a une contrainte de clé étrangère réelle vers devis(id) —
// un id fictif la viole (23503), il faut donc de vraies lignes devis ici.
async function creerDevisFictif(entrepriseId: string, dealId: string, contactId: string, creeParId: string, numero: string) {
  const [d] = await avecEntreprise(entrepriseId, (tx) =>
    tx
      .insert(devis)
      .values({
        entrepriseId,
        numero,
        dealId,
        contactId,
        assigneAId: creeParId,
        dateValidite: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        montantHT: 100000,
        montantTVA: 19250,
        montantTTC: 119250,
        creeParId,
      })
      .returning({ id: devis.id })
  );
  return d.id;
}

/**
 * Docs/palier-2-*, section 3 : un devis accepté ne crée jamais un deuxième
 * Dossier pour un client déjà connu — un client fidèle qui recommande garde
 * son Dossier et n'accumule que de nouveaux Projets. C'est exactement la
 * correction que la première version fusionnée du document ne permettait
 * pas de représenter (voir section 1).
 */
describe("Palier 2 — pont devis accepté → Dossier + Projet", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let contactId: string;
  let dealId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Pont Dossier Projet", secteurProfil: "cabinet" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-pont@vertexone.test", nomComplet: "Admin Pont", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Fidèle", telephone: "+237600000003", assigneAId: utilisateurId })
        .returning({ id: contact.id })
    );
    contactId = c.id;

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(deal)
        .values({ entrepriseId, titre: "Deal — Client Fidèle", contactId, assigneAId: utilisateurId })
        .returning({ id: deal.id })
    );
    dealId = d.id;
  });

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      // Depuis le Palier 3, creerProjetDepuisDevisAccepte() crée aussi un
      // canal lié au projet (creerCanalPourProjet()) — il faut le supprimer
      // avant le projet, sinon la contrainte de clé étrangère
      // canal_projet_id_projet_id_fk bloque le nettoyage (bug réel rencontré
      // en relançant la suite complète après le Palier 3, pas anticipé en
      // écrivant ce test au Palier 2).
      await tx.delete(canal).where(eq(canal.entrepriseId, entrepriseId));
      await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(devis).where(eq(devis.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("le premier devis accepté crée un Dossier et un Projet", async () => {
    const devisId = await creerDevisFictif(entrepriseId, dealId, contactId, utilisateurId, "DEV-2026-000001");

    const resultat = await avecEntreprise(entrepriseId, (tx) =>
      creerProjetDepuisDevisAccepte(tx, {
        entrepriseId,
        contactId,
        contactNom: "Client Fidèle",
        secteurProfil: "cabinet",
        devisId,
        numeroDevis: "DEV-2026-000001",
        responsableId: utilisateurId,
      })
    );

    const [ledossier] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossier).where(eq(dossier.id, resultat.dossierId)));
    expect(ledossier).toBeDefined();
    expect(ledossier.contactId).toBe(contactId);

    const [leProjet] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(projet).where(eq(projet.id, resultat.projetId)));
    expect(leProjet).toBeDefined();
    // Vocabulaire "cabinet" → "Mission", pas "Projet" générique.
    expect(leProjet.titre).toBe("Mission — DEV-2026-000001");
    expect(leProjet.devisOrigineId).toBe(devisId);
  });

  test("un deuxième devis accepté pour le même client réutilise le Dossier existant", async () => {
    const devisIdA = await creerDevisFictif(entrepriseId, dealId, contactId, utilisateurId, "DEV-2026-000002");
    const devisIdB = await creerDevisFictif(entrepriseId, dealId, contactId, utilisateurId, "DEV-2026-000003");

    const premier = await avecEntreprise(entrepriseId, (tx) =>
      creerProjetDepuisDevisAccepte(tx, {
        entrepriseId,
        contactId,
        contactNom: "Client Fidèle",
        secteurProfil: "cabinet",
        devisId: devisIdA,
        numeroDevis: "DEV-2026-000002",
        responsableId: utilisateurId,
      })
    );

    const deuxieme = await avecEntreprise(entrepriseId, (tx) =>
      creerProjetDepuisDevisAccepte(tx, {
        entrepriseId,
        contactId,
        contactNom: "Client Fidèle",
        secteurProfil: "cabinet",
        devisId: devisIdB,
        numeroDevis: "DEV-2026-000003",
        responsableId: utilisateurId,
      })
    );

    // Même dossier réutilisé, mais deux projets distincts.
    expect(deuxieme.dossierId).toBe(premier.dossierId);
    expect(deuxieme.projetId).not.toBe(premier.projetId);

    const dossiersDuClient = await avecEntreprise(entrepriseId, (tx) => tx.select().from(dossier).where(eq(dossier.contactId, contactId)));
    expect(dossiersDuClient).toHaveLength(1);

    const projetsDuDossier = await avecEntreprise(entrepriseId, (tx) => tx.select().from(projet).where(eq(projet.dossierId, premier.dossierId)));
    expect(projetsDuDossier.length).toBeGreaterThanOrEqual(2);
  }, 60_000); // deux devis + deux appels au pont + plusieurs relectures — au-delà des 30s par défaut sous charge Neon réelle (voir CLAUDE.md).
});
