import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { documentRedige, entreprise, utilisateur } from "@/db/schema";
import { contenuVide } from "@/lib/redaction/contenu";
import { miseEnPageParDefaut } from "@/lib/redaction/mise-en-page";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Test de fuite entre entreprises (exigé après chaque nouveau module) : une entreprise ne peut techniquement ni lire, ni
 * modifier, ni supprimer, ni créer un document rédigé au nom d'une autre — la RLS de `document_redige` l'interdit, sans
 * dépendre du code applicatif.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Redaction Fuite A ${suffixe}`;
const nomB = `TEST Redaction Fuite B ${suffixe}`;
let a = "", b = "", adminA = "", adminB = "", docA = "";

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: a, email: `red-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: b, email: `red-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
  [{ id: docA }] = await avecEntreprise(a, (tx) =>
    tx.insert(documentRedige).values({ entrepriseId: a, titre: "SECRET A", contenu: contenuVide(), miseEnPage: miseEnPageParDefaut(), assigneAId: adminA }).returning({ id: documentRedige.id })
  );
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Documents rédigés — isolation entre entreprises (RLS)", () => {
  test("l'entreprise B ne voit pas le document de A, ni par liste ni par identifiant", async () => {
    const liste = await avecEntreprise(b, (tx) => tx.select().from(documentRedige));
    expect(liste).toHaveLength(0);
    const parId = await avecEntreprise(b, (tx) => tx.select().from(documentRedige).where(eq(documentRedige.id, docA)));
    expect(parId).toHaveLength(0);
    // A, elle, le voit
    expect(await avecEntreprise(a, (tx) => tx.select().from(documentRedige).where(eq(documentRedige.id, docA)))).toHaveLength(1);
  });

  test("l'entreprise B ne peut ni modifier ni supprimer le document de A", async () => {
    const modifies = await avecEntreprise(b, (tx) => tx.update(documentRedige).set({ titre: "PIRATÉ" }).where(eq(documentRedige.id, docA)).returning({ id: documentRedige.id }));
    expect(modifies).toHaveLength(0);
    const supprimes = await avecEntreprise(b, (tx) => tx.delete(documentRedige).where(eq(documentRedige.id, docA)).returning({ id: documentRedige.id }));
    expect(supprimes).toHaveLength(0);
    const [intact] = await avecEntreprise(a, (tx) => tx.select().from(documentRedige).where(eq(documentRedige.id, docA)));
    expect(intact.titre).toBe("SECRET A");
  });

  test("B ne peut pas créer un document rattaché à l'entreprise A (WITH CHECK)", async () => {
    await expect(
      avecEntreprise(b, (tx) => tx.insert(documentRedige).values({ entrepriseId: a, titre: "Intrus", contenu: contenuVide(), miseEnPage: miseEnPageParDefaut(), assigneAId: adminB }))
    ).rejects.toThrow();
  });
});
