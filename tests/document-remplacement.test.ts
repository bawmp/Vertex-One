import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, document, demandeSignature } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * remplacerDocument() (src/lib/actions/document.ts) vérifie la session, indisponible hors requête HTTP : ces tests
 * rejouent, sur la base réelle et sous RLS, les deux requêtes sur lesquelles repose sa sécurité — la garde « déjà
 * soumis à signature » et la mise à jour du document — comme le reste du dépôt (voir CLAUDE.md).
 */
describe("Remplacement d'un document — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST RemplacerDoc A ${suffixe}`;
  const nomB = `TEST RemplacerDoc B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let adminId: string;
  let docLibre: string;
  let docSigne: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `admin-remplacer-${suffixe}@vertexone.test`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminId = u.id;
    await avecEntreprise(entrepriseA, async (tx) => {
      const base = { entrepriseId: entrepriseA, typeMime: "application/pdf", tailleOctets: 10, televerseParId: adminId, categorie: "GENERAL" as const };
      const [libre] = await tx.insert(document).values({ ...base, nom: "modele-v1.pdf", cleStockage: "ancienne-cle" }).returning({ id: document.id });
      const [signe] = await tx.insert(document).values({ ...base, nom: "contrat.pdf", cleStockage: "cle-contrat" }).returning({ id: document.id });
      await tx.insert(demandeSignature).values({ entrepriseId: entrepriseA, documentId: signe.id, empreinteDocument: "a".repeat(64), creeParId: adminId });
      docLibre = libre.id;
      docSigne = signe.id;
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 90_000);

  const aUneSignature = (entrepriseId: string, documentId: string) =>
    avecEntreprise(entrepriseId, async (tx) => (await tx.select({ id: demandeSignature.id }).from(demandeSignature).where(eq(demandeSignature.documentId, documentId))).length > 0);

  test("un document soumis à signature est détecté (donc jamais remplaçable) ; un document libre ne l'est pas", async () => {
    expect(await aUneSignature(entrepriseA, docSigne)).toBe(true);
    expect(await aUneSignature(entrepriseA, docLibre)).toBe(false);
  });

  test("le remplacement change le fichier mais garde l'identifiant, la catégorie et l'auteur", async () => {
    const avant = await avecEntreprise(entrepriseA, (tx) => tx.select().from(document).where(eq(document.id, docLibre)));
    await avecEntreprise(entrepriseA, (tx) =>
      tx.update(document).set({ nom: "modele-v2.docx", cleStockage: "nouvelle-cle", typeMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tailleOctets: 4321 }).where(eq(document.id, docLibre))
    );
    const [apres] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(document).where(eq(document.id, docLibre)));

    expect(apres.id).toBe(avant[0].id);
    expect(apres.categorie).toBe("GENERAL");
    expect(apres.televerseParId).toBe(adminId);
    expect(apres.nom).toBe("modele-v2.docx");
    expect(apres.cleStockage).toBe("nouvelle-cle");
    expect(apres.tailleOctets).toBe(4321);
  });

  test("fuite : l'entreprise B ne peut ni voir, ni remplacer, ni détecter la signature d'un document de l'entreprise A", async () => {
    const modifies = await avecEntreprise(entrepriseB, (tx) =>
      tx.update(document).set({ nom: "piraté.pdf", cleStockage: "cle-pirate" }).where(eq(document.id, docSigne)).returning({ id: document.id })
    );
    expect(modifies).toHaveLength(0);
    expect(await aUneSignature(entrepriseB, docSigne)).toBe(false);

    const [intact] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(document).where(and(eq(document.id, docSigne))));
    expect(intact.nom).toBe("contrat.pdf");
    expect(intact.cleStockage).toBe("cle-contrat");
  });
});
