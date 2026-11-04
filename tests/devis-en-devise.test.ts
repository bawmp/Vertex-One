import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { contact, devis, entreprise, facture, ligneDevis, utilisateur } from "@/db/schema";
import { accepterDevisEtCreerFacture } from "@/lib/facturation/acceptation-devis";
import { lirePrixDevise, mentionDevise, totalEnDeviseCentimes } from "@/lib/devises/facture";
import { convertirVersXaf } from "@/lib/devises/regles";
import { enregistrerTaux } from "@/lib/devises/taux";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Devis saisi dans une autre devise : prix convertis au taux figé, total en devise, et la facture issue du devis reprend devise et taux. */
describe("Devis en devise — règles pures", () => {
  test("lecture d'un prix en devise : centièmes au plus, virgule ou point", () => {
    expect(lirePrixDevise("12,50")).toBe(12.5);
    expect(lirePrixDevise("12.5")).toBe(12.5);
    expect(lirePrixDevise("0")).toBe(0);
    expect(lirePrixDevise("12.505")).toBeNull();
    expect(lirePrixDevise("-3")).toBeNull();
    expect(lirePrixDevise("abc")).toBeNull();
    expect(lirePrixDevise("")).toBeNull();
  });

  test("conversion au taux figé : 100 EUR à 655,957 = 65 596 FCFA, et le total retombe sur 100,00 EUR", () => {
    expect(convertirVersXaf(100, 655957)).toBe(65596);
    expect(totalEnDeviseCentimes(65596, 655957)).toBe(10000);
  });

  test("la mention du devis dit la devise, le total et le taux", () => {
    const m = mentionDevise({ devise: "EUR", montantDeviseCentimes: 10000, tauxChangeMilliemes: 655957 });
    expect(m).toContain("100");
    expect(m).toContain("655,957");
    expect(mentionDevise({ devise: null, montantDeviseCentimes: null, tauxChangeMilliemes: null })).toBeNull();
  });
});

describe("Devis en devise — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST DevisDevise A ${suffixe}`;
  let A: string;
  let uA: string;
  let contactId: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "services", niu: "M012600000010Z" }).returning({ id: entreprise.id });
    A = a.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId: A, email: `devisdevise-${suffixe}@vertexone.test`, nomComplet: "Admin DevisDevise", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = u.id;
    const [c] = await avecEntreprise(A, (tx) => tx.insert(contact).values({ entrepriseId: A, nom: "Client Devise", telephone: "+237600000088", assigneAId: uA }).returning({ id: contact.id }));
    contactId = c.id;
    await avecEntreprise(A, (tx) => enregistrerTaux(tx, A, { devise: "EUR", taux: "655,957", dateEffet: "2026-01-01" }));
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
  }, 60_000);

  const creerDevis = (extra: Partial<typeof devis.$inferInsert>) =>
    avecEntreprise(A, async (tx) => {
      const [d] = await tx
        .insert(devis)
        .values({ entrepriseId: A, numero: `DEV-DD-${suffixe}-${Math.random().toString(36).slice(2, 6)}`, contactId, assigneAId: uA, dateValidite: new Date(Date.now() + 864e5), montantHT: 65596, montantTVA: 0, montantTTC: 65596, creeParId: uA, ...extra } as typeof devis.$inferInsert)
        .returning({ id: devis.id });
      await tx.insert(ligneDevis).values({ entrepriseId: A, devisId: d.id, designation: "Prestation", quantite: 1, prixUnitaire: 65596, tauxTVA: 0 });
      return d.id;
    });

  test("la facture issue d'un devis en euros reprend devise, total en devise et taux figé ; les montants restent en FCFA", async () => {
    const id = await creerDevis({ devise: "EUR", tauxChangeMilliemes: 655957, montantDeviseCentimes: 10000 });
    const factureId = await avecEntreprise(A, (tx) => accepterDevisEtCreerFacture(tx, A, id));
    expect(factureId).toBeTruthy();
    const [f] = await avecEntreprise(A, (tx) => tx.select().from(facture).where(eq(facture.id, factureId!)));
    expect(f).toMatchObject({ devise: "EUR", tauxChangeMilliemes: 655957, montantDeviseCentimes: 10000, montantTTC: 65596 });
  }, 90_000);

  test("un devis en FCFA donne une facture sans devise", async () => {
    const id = await creerDevis({});
    const factureId = await avecEntreprise(A, (tx) => accepterDevisEtCreerFacture(tx, A, id));
    const [f] = await avecEntreprise(A, (tx) => tx.select().from(facture).where(eq(facture.id, factureId!)));
    expect(f.devise).toBeNull();
    expect(f.tauxChangeMilliemes).toBeNull();
    expect(f.montantDeviseCentimes).toBeNull();
  }, 90_000);

  test("fuite : une autre entreprise ne voit ni le devis ni la facture en devise", async () => {
    const [b] = await db.insert(entreprise).values({ nom: `TEST DevisDevise B ${suffixe}`, secteurProfil: "services" }).returning({ id: entreprise.id });
    try {
      expect(await avecEntreprise(b.id, (tx) => tx.select({ id: devis.id }).from(devis).where(eq(devis.contactId, contactId)))).toHaveLength(0);
      expect(await avecEntreprise(b.id, (tx) => tx.select({ id: facture.id }).from(facture).where(eq(facture.contactId, contactId)))).toHaveLength(0);
    } finally {
      await supprimerEntrepriseDeTest(`TEST DevisDevise B ${suffixe}`);
    }
  }, 90_000);
});
