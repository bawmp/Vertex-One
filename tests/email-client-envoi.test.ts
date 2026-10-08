import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, dossier, document } from "@/db/schema";
import { formaterExpediteur } from "@/lib/email/client";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("Expéditeur des emails envoyés au nom d'une entreprise", () => {
  test("affiche le nom de l'entreprise, avec l'adresse du domaine vérifié", () => {
    expect(formaterExpediteur("Beau & Bon Traiteur")).toBe('"Beau & Bon Traiteur" <notifications@vertexone.cm>');
  });

  test("sans nom, retombe sur l'expéditeur par défaut", () => {
    expect(formaterExpediteur(undefined)).toBe("Vertex One <notifications@vertexone.cm>");
    expect(formaterExpediteur("   ")).toBe("Vertex One <notifications@vertexone.cm>");
  });

  test("un nom piégé ne peut pas injecter un en-tête ni une autre adresse", () => {
    const e = formaterExpediteur('Pirate" <pirate@exemple.com>\r\nBcc: victime@exemple.com');
    expect(e).not.toMatch(/[\r\n]/);
    expect((e.match(/@/g) ?? []).length).toBe(1); // seule l'adresse du domaine vérifié
    expect(e.endsWith("<notifications@vertexone.cm>")).toBe(true);
    expect((e.match(/</g) ?? []).length).toBe(1);
  });

  test("un nom très long est tronqué", () => {
    expect(formaterExpediteur("A".repeat(500)).length).toBeLessThan(140);
  });
});

/**
 * envoyerContratParEmail() (src/lib/actions/email-client.ts) ne joint qu'un document ORDINAIRE du MÊME dossier que le
 * contrat. L'action vérifie la session (indisponible hors requête HTTP) : on rejoue ici exactement la requête de
 * sélection du document, sur la base réelle, pour prouver qu'une pièce sensible ou d'un autre dossier n'est jamais
 * retenue — voir CLAUDE.md sur le patron de test des Server Actions.
 */
describe("Envoi d'un contrat par email — quels documents peuvent partir", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomEntreprise = `TEST EnvoiContrat ${suffixe}`;
  let entrepriseId: string;
  let dossierA: string;
  let dossierB: string;
  let docGeneral: string;
  let docIdentite: string;
  let docAutreDossier: string;

  beforeAll(async () => {
    const [ent] = await db.insert(entreprise).values({ nom: nomEntreprise, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = ent.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `admin-envoicontrat-${suffixe}@vertexone.test`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
    await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client", telephone: "+237690000002", email: "client@exemple.test", assigneAId: u.id }).returning({ id: contact.id });
      const [c2] = await tx.insert(contact).values({ entrepriseId, nom: "Autre client", telephone: "+237690000003", assigneAId: u.id }).returning({ id: contact.id });
      const [da] = await tx.insert(dossier).values({ entrepriseId, contactId: c.id, titre: "Dossier A", responsableId: u.id }).returning({ id: dossier.id });
      const [db2] = await tx.insert(dossier).values({ entrepriseId, contactId: c2.id, titre: "Dossier B", responsableId: u.id }).returning({ id: dossier.id });
      dossierA = da.id;
      dossierB = db2.id;
      const base = { entrepriseId, typeMime: "application/pdf", tailleOctets: 10, televerseParId: u.id };
      const [g] = await tx.insert(document).values({ ...base, dossierId: dossierA, categorie: "GENERAL", nom: "contrat.pdf", cleStockage: "g" }).returning({ id: document.id });
      const [i] = await tx.insert(document).values({ ...base, dossierId: dossierA, categorie: "PIECE_IDENTITE", nom: "passeport.pdf", cleStockage: "i" }).returning({ id: document.id });
      const [x] = await tx.insert(document).values({ ...base, dossierId: dossierB, categorie: "GENERAL", nom: "autre.pdf", cleStockage: "x" }).returning({ id: document.id });
      docGeneral = g.id;
      docIdentite = i.id;
      docAutreDossier = x.id;
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomEntreprise);
  }, 90_000);

  const selectionner = (documentId: string) =>
    avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(document).where(and(eq(document.id, documentId), eq(document.dossierId, dossierA), eq(document.categorie, "GENERAL")))
    );

  test("un document ordinaire du dossier du contrat peut partir", async () => {
    expect(await selectionner(docGeneral)).toHaveLength(1);
  });

  test("une pièce d'identité du même dossier ne part jamais", async () => {
    expect(await selectionner(docIdentite)).toHaveLength(0);
  });

  test("un document d'un autre dossier ne part pas non plus", async () => {
    expect(await selectionner(docAutreDossier)).toHaveLength(0);
  });
});
