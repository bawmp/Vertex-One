import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, facture } from "@/db/schema";
import { genererNumeroDevis, genererNumeroFacture } from "@/lib/facturation/numerotation";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Des documents copiés ou importés avec leur numéro d'origine (transfert entre entreprises, reprise d'un ancien outil)
 * laissent le compteur en retard : le numéro suivant serait un doublon et le document, impossible à créer (cas réel :
 * l'acceptation d'un devis par un client échouait sur « facture_entreprise_numero_unique »). Le compteur est donc aligné
 * sur le plus grand numéro déjà émis ; sans retard, la numérotation reste continue, sans trou ni saut.
 */
const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Numero A ${suffixe}`;
const nomB = `TEST Numero B ${suffixe}`;
let a = "", b = "", adminA = "", adminB = "", contactA = "", contactB = "";

async function creerDevis(entrepriseId: string, adminId: string, contactId: string, numero: string) {
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(devis).values({ entrepriseId, numero, contactId, assigneAId: adminId, creeParId: adminId, dateValidite: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 })
  );
}
async function creerFacture(entrepriseId: string, adminId: string, contactId: string, numero: string) {
  await avecEntreprise(entrepriseId, (tx) =>
    tx.insert(facture).values({ entrepriseId, numero, contactId, assigneAId: adminId, dateEcheance: new Date(Date.now() + 864e5), montantHT: 1000, montantTVA: 0, montantTTC: 1000 })
  );
}

beforeAll(async () => {
  [{ id: a }] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "generique" }).returning({ id: entreprise.id });
  [{ id: b }] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "generique" }).returning({ id: entreprise.id });
  adminA = (await db.insert(utilisateur).values({ entrepriseId: a, email: `num-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id }))[0].id;
  adminB = (await db.insert(utilisateur).values({ entrepriseId: b, email: `num-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id }))[0].id;
  contactA = (await avecEntreprise(a, (tx) => tx.insert(contact).values({ entrepriseId: a, nom: "Client A", telephone: "690000000", assigneAId: adminA }).returning({ id: contact.id })))[0].id;
  contactB = (await avecEntreprise(b, (tx) => tx.insert(contact).values({ entrepriseId: b, nom: "Client B", telephone: "690000001", assigneAId: adminB }).returning({ id: contact.id })))[0].id;
}, 120_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 120_000);

describe("Numérotation — alignement du compteur sur les numéros déjà émis", () => {
  test("des devis copiés avec leur numéro (compteur à 0) : le numéro suivant continue après le plus grand", async () => {
    await creerDevis(a, adminA, contactA, "DEV-2026-000003");
    await creerDevis(a, adminA, contactA, "DEV-2026-000007");
    const premier = await avecEntreprise(a, (tx) => genererNumeroDevis(tx, a));
    const second = await avecEntreprise(a, (tx) => genererNumeroDevis(tx, a));
    expect(premier).toMatch(/^DEV-\d{4}-000008$/);
    expect(second).toMatch(/^DEV-\d{4}-000009$/);
  }, 120_000);

  test("une facture copiée avec son numéro (compteur à 0) : le numéro suivant n'est plus un doublon", async () => {
    await creerFacture(a, adminA, contactA, "FAC-2026-000001");
    const numero = await avecEntreprise(a, (tx) => genererNumeroFacture(tx, a));
    expect(numero).toMatch(/^FAC-\d{4}-000002$/);
    // et l'insertion avec ce numéro passe (aucune violation d'unicité)
    await creerFacture(a, adminA, contactA, numero);
  }, 120_000);

  test("un numéro importé d'un autre outil (format différent, même très grand) est ignoré : ni saut, ni dépassement d'entier", async () => {
    // entreprise B : compteur de factures à 2 (voir le test suivant) — on l'isole ici avec une autre entreprise « propre »
    const [{ id: c }] = await db.insert(entreprise).values({ nom: `${nomB} import`, secteurProfil: "generique" }).returning({ id: entreprise.id });
    try {
      const admin = (await db.insert(utilisateur).values({ entrepriseId: c, email: `num-c-${suffixe}@vertexone.test`, nomComplet: "Admin C", role: "ADMIN" }).returning({ id: utilisateur.id }))[0].id;
      const ct = (await avecEntreprise(c, (tx) => tx.insert(contact).values({ entrepriseId: c, nom: "Client C", telephone: "690000002", assigneAId: admin }).returning({ id: contact.id })))[0].id;
      for (const numero of ["INV-20241015123456", "2024/0045", "FA-99999999999", "FAC-2026-99999999999"]) await creerFacture(c, admin, ct, numero);
      const premier = await avecEntreprise(c, (tx) => genererNumeroFacture(tx, c));
      expect(premier).toMatch(/-000001$/);
      // un vrai numéro du système, lui, est pris en compte
      await creerFacture(c, admin, ct, "FAC-2026-000040");
      expect(await avecEntreprise(c, (tx) => genererNumeroFacture(tx, c))).toMatch(/-000041$/);
    } finally {
      await supprimerEntrepriseDeTest(`${nomB} import`);
    }
  }, 180_000);

  test("sans retard, la numérotation reste continue, sans trou ni saut ; une autre entreprise n'est pas touchée", async () => {
    const un = await avecEntreprise(b, (tx) => genererNumeroFacture(tx, b));
    const deux = await avecEntreprise(b, (tx) => genererNumeroFacture(tx, b));
    expect(un).toMatch(/-000001$/);
    expect(deux).toMatch(/-000002$/);
    // un compteur EN AVANCE sur les documents existants n'est jamais ramené en arrière
    await db.update(entreprise).set({ compteurDevis: 20 }).where(eq(entreprise.id, b));
    await creerDevis(b, adminB, contactB, "DEV-2026-000005");
    const suivant = await avecEntreprise(b, (tx) => genererNumeroDevis(tx, b));
    expect(suivant).toMatch(/-000021$/);
    // l'entreprise A, elle, n'a pas bougé
    const [ligneA] = await db.select({ f: entreprise.compteurFactures, d: entreprise.compteurDevis }).from(entreprise).where(eq(entreprise.id, a));
    expect(ligneA).toEqual({ f: 2, d: 9 });
  }, 120_000);
});
