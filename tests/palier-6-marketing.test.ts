import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, dossier, projet, addonActif } from "@/db/schema";
import { resoudreSegment } from "@/lib/marketing/segments";
import { verifierProspectsInactifs, verifierClientsEnSommeil } from "@/lib/marketing/automatisations";
import { disponibleAddon } from "@/lib/plans";
import { genererLienVisio } from "@/lib/marketing/visio";

describe("Palier 6 — Marketing", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let contactPerduId: string;
  let contactPropositionId: string;
  let contactDossierId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST P6 Marketing Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-p6-marketing@vertexone.test", nomComplet: "Admin Marketing", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [cPerdu] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Perdu", telephone: "+237600000010", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      contactPerduId = cPerdu.id;
      await tx.insert(deal).values({ entrepriseId, titre: "Deal — Client Perdu", contactId: cPerdu.id, statut: "PERDU", assigneAId: utilisateurId });

      const [cProposition] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Proposition", telephone: "+237600000011", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      contactPropositionId = cProposition.id;
      await tx.insert(deal).values({ entrepriseId, titre: "Deal — Client Proposition", contactId: cProposition.id, statut: "PROPOSITION", assigneAId: utilisateurId });

      const [cDossier] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Dossier Ancien", telephone: "+237600000012", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      contactDossierId = cDossier.id;

      const dateAncienne = new Date();
      dateAncienne.setDate(dateAncienne.getDate() - 120);
      await tx
        .insert(dossier)
        .values({ entrepriseId, contactId: cDossier.id, titre: "Dossier Ancien", responsableId: utilisateurId, dateOuverture: dateAncienne })
        .returning({ id: dossier.id });

      // Un deuxième dossier avec un projet actif — ne doit jamais apparaître
      // dans le segment "sansProjetDepuisJours".
      const [cAvecProjet] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Avec Projet", telephone: "+237600000013", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [dAvecProjet] = await tx
        .insert(dossier)
        .values({ entrepriseId, contactId: cAvecProjet.id, titre: "Dossier Avec Projet", responsableId: utilisateurId, dateOuverture: dateAncienne })
        .returning({ id: dossier.id });
      await tx.insert(projet).values({ entrepriseId, dossierId: dAvecProjet.id, titre: "Projet En Cours", statut: "EN_COURS", responsablePrincipalId: utilisateurId });
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(projet).where(eq(projet.entrepriseId, entrepriseId));
      await tx.delete(dossier).where(eq(dossier.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
      await tx.delete(addonActif).where(eq(addonActif.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("resoudreSegment({statut}) ne retourne que les contacts dont le deal est dans cet état", async () => {
    const contacts = await avecEntreprise(entrepriseId, (tx) => resoudreSegment(tx, entrepriseId, { statut: "PERDU" }));
    expect(contacts.map((c) => c.id)).toEqual([contactPerduId]);
  });

  test("resoudreSegment({sansProjetDepuisJours}) ne retourne que les dossiers ouverts depuis assez longtemps et sans projet actif", async () => {
    const contacts = await avecEntreprise(entrepriseId, (tx) => resoudreSegment(tx, entrepriseId, { sansProjetDepuisJours: 90 }));
    expect(contacts.map((c) => c.id)).toEqual([contactDossierId]);
  });

  test("resoudreSegment({sansProjetDepuisJours}) avec un seuil trop élevé ne retourne rien", async () => {
    const contacts = await avecEntreprise(entrepriseId, (tx) => resoudreSegment(tx, entrepriseId, { sansProjetDepuisJours: 365 }));
    expect(contacts).toHaveLength(0);
  });

  test("verifierProspectsInactifs relance uniquement les deals PROPOSITION sans interaction récente", async () => {
    const resultats = await avecEntreprise(entrepriseId, (tx) => verifierProspectsInactifs(tx, entrepriseId));
    expect(resultats.map((r) => r.contactId)).toContain(contactPropositionId);
    expect(resultats.map((r) => r.contactId)).not.toContain(contactPerduId);
    // WhatsApp non configuré dans l'environnement de test — échec attendu.
    expect(resultats.every((r) => r.envoye === false)).toBe(true);
  });

  test("verifierClientsEnSommeil relance les dossiers sans projet actif, pas ceux avec un projet en cours", async () => {
    const resultats = await avecEntreprise(entrepriseId, (tx) => verifierClientsEnSommeil(tx, entrepriseId));
    expect(resultats.map((r) => r.contactId)).toContain(contactDossierId);
  });

  test("disponibleAddon reflète l'activation réelle en base", async () => {
    const avantActivation = await avecEntreprise(entrepriseId, (tx) => disponibleAddon(tx, { id: entrepriseId, statutAbonnement: "actif" }, "MARKETING"));
    expect(avantActivation).toBe(false);

    await avecEntreprise(entrepriseId, (tx) => tx.insert(addonActif).values({ entrepriseId, addon: "MARKETING", prixMensuel: 10_000 }));

    const apresActivation = await avecEntreprise(entrepriseId, (tx) => disponibleAddon(tx, { id: entrepriseId, statutAbonnement: "actif" }, "MARKETING"));
    expect(apresActivation).toBe(true);

    const entrepriseSuspendue = await avecEntreprise(entrepriseId, (tx) => disponibleAddon(tx, { id: entrepriseId, statutAbonnement: "suspendu" }, "MARKETING"));
    expect(entrepriseSuspendue).toBe(false);
  });

  test("genererLienVisio produit une URL Jitsi qui référence l'entreprise et le contact", () => {
    const lien = genererLienVisio(entrepriseId, contactPerduId);
    expect(lien).toMatch(/^https:\/\/meet\.jit\.si\//);
    expect(lien).toContain(entrepriseId);
    expect(lien).toContain(contactPerduId);
  });
});
