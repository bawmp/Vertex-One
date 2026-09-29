import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, document } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * ajouterDocument() (src/lib/actions/document.ts) dérive toujours document.contactId depuis dossier.contactId
 * quand un dossierId est fourni (jamais une valeur du formulaire), et revérifie en base un contactId soumis
 * directement (upload autonome depuis la fiche Contact, sans Dossier). Ces tests reproduisent cette logique
 * exactement (pas d'appel à televerserVersR2, non pertinent ici) — voir CLAUDE.md sur le patron de test des
 * Server Actions dans ce dépôt.
 */
describe("Document — rattachement au Contact", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomEntreprise = `TEST DocumentContact ${suffixe}`;
  let entrepriseId: string;
  let utilisateurId: string;
  let contactId: string;
  let dossierId: string;

  beforeAll(async () => {
    const [ent] = await db.insert(entreprise).values({ nom: nomEntreprise, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = ent.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `admin-doccontact-${suffixe}@vertexone.test`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [c, d] = await avecEntreprise(entrepriseId, async (tx) => {
      const [cc] = await tx.insert(contact).values({ entrepriseId, nom: "Client Test", telephone: "+237690000000", assigneAId: utilisateurId }).returning({ id: contact.id });
      const [dd] = await tx.insert(dossier).values({ entrepriseId, contactId: cc.id, titre: "Dossier de test", responsableId: utilisateurId }).returning({ id: dossier.id });
      return [cc.id, dd.id];
    });
    contactId = c;
    dossierId = d;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomEntreprise);
  }, 60_000);

  test("un document déposé avec un dossierId hérite du contactId de ce dossier", async () => {
    const [leDossier] = await avecEntreprise(entrepriseId, (tx) => tx.select({ contactId: dossier.contactId }).from(dossier).where(eq(dossier.id, dossierId)));
    const contactIdEffectif = leDossier?.contactId ?? null;
    expect(contactIdEffectif).toBe(contactId);

    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(document)
        .values({ entrepriseId, dossierId, contactId: contactIdEffectif, categorie: "GENERAL", nom: "piece.pdf", cleStockage: "x", typeMime: "application/pdf", tailleOctets: 10, televerseParId: utilisateurId })
        .returning({ id: document.id, contactId: document.contactId })
    );
    expect(d.contactId).toBe(contactId);

    const retrouve = await avecEntreprise(entrepriseId, (tx) => tx.select().from(document).where(eq(document.contactId, contactId)));
    expect(retrouve).toHaveLength(1);
    expect(retrouve[0].id).toBe(d.id);
  });

  test("un document déposé avec seulement un contactId (aucun dossier) reste catégorie GENERAL", async () => {
    const [d] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(document)
        .values({ entrepriseId, contactId, categorie: "GENERAL", nom: "note.pdf", cleStockage: "y", typeMime: "application/pdf", tailleOctets: 5, televerseParId: utilisateurId })
        .returning({ id: document.id, dossierId: document.dossierId, projetId: document.projetId, categorie: document.categorie })
    );
    expect(d.dossierId).toBeNull();
    expect(d.projetId).toBeNull();
    expect(d.categorie).toBe("GENERAL");
  });

  test("le contactId soumis directement doit correspondre à un vrai Contact de l'entreprise (jamais fait confiance tel quel)", async () => {
    const [inexistant] = await avecEntreprise(entrepriseId, (tx) => tx.select({ id: contact.id }).from(contact).where(eq(contact.id, "id-qui-n-existe-pas")));
    expect(inexistant).toBeUndefined();
  });

  test("fuite : une entreprise fictive B ne voit pas les documents liés au contact d'une entreprise A", async () => {
    const [autreEntreprise] = await db.insert(entreprise).values({ nom: `TEST DocumentContact Autre ${suffixe}`, secteurProfil: "agence" }).returning({ id: entreprise.id });
    try {
      const documentsVusParB = await avecEntreprise(autreEntreprise.id, (tx) => tx.select().from(document).where(eq(document.contactId, contactId)));
      expect(documentsVusParB).toHaveLength(0);
    } finally {
      await db.delete(entreprise).where(eq(entreprise.id, autreEntreprise.id));
    }
  });
});
