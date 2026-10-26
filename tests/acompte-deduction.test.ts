import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, facture, factureAcompte, paiement, ecritureComptable } from "@/db/schema";
import { genererNumeroFactureAcompte, genererNumeroFacture } from "@/lib/facturation/numerotation";
import { appliquerAcompteSurFacturesOuvertes, appliquerAcomptesSurFacture, extraireAcomptesDeduits, numeroAcompteDeReference, referenceAcompte } from "@/lib/facturation/acompte";
import { lireSolde } from "@/lib/facturation/solde";

/**
 * Déduction automatique des acomptes (2026-10-26) : un acompte encaissé vient en déduction du solde de la facture du même client, dans les
 * deux sens (facture déjà ouverte au moment de l'encaissement, ou facture émise après), partiellement si besoin, sans jamais mêler deux
 * clients ni deux affaires, et jamais deux fois.
 */
describe("Acomptes — déduction automatique sur la facture", () => {
  let entrepriseId: string;
  let autreEntrepriseId: string;
  let utilisateurId: string;
  let autreUtilisateurId: string;
  let contactId: string;
  let autreContactId: string;
  let autreContactEntrepriseId: string;
  let dealA: string;
  let dealB: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Acompte Deduction", secteurProfil: "agence", niu: "M012026000088" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [e2] = await db.insert(entreprise).values({ nom: "TEST Acompte Deduction B", secteurProfil: "agence", niu: "M012026000089" }).returning({ id: entreprise.id });
    autreEntrepriseId = e2.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `ad-${entrepriseId}@vertexone.test`, nomComplet: "Admin AD", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurId = u.id;
    const [u2] = await db.insert(utilisateur).values({ entrepriseId: autreEntrepriseId, email: `ad-${autreEntrepriseId}@vertexone.test`, nomComplet: "Admin AD B", role: "ADMIN" }).returning({ id: utilisateur.id });
    autreUtilisateurId = u2.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client AD", telephone: "+237600000081", assigneAId: utilisateurId }).returning({ id: contact.id });
      contactId = c.id;
      const [c2] = await tx.insert(contact).values({ entrepriseId, nom: "Autre client AD", telephone: "+237600000082", assigneAId: utilisateurId }).returning({ id: contact.id });
      autreContactId = c2.id;
      const [dA] = await tx.insert(deal).values({ entrepriseId, titre: "Affaire A", contactId: c.id, assigneAId: utilisateurId }).returning({ id: deal.id });
      dealA = dA.id;
      const [dB] = await tx.insert(deal).values({ entrepriseId, titre: "Affaire B", contactId: c.id, assigneAId: utilisateurId }).returning({ id: deal.id });
      dealB = dB.id;
    });
    await avecEntreprise(autreEntrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: autreEntrepriseId, nom: "Client AD B", telephone: "+237600000083", assigneAId: autreUtilisateurId }).returning({ id: contact.id });
      autreContactEntrepriseId = c.id;
    });
  }, 60_000);

  afterAll(async () => {
    for (const id of [entrepriseId, autreEntrepriseId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, id));
        await tx.delete(paiement).where(eq(paiement.entrepriseId, id));
        await tx.delete(facture).where(eq(facture.entrepriseId, id));
        await tx.delete(factureAcompte).where(eq(factureAcompte.entrepriseId, id));
        await tx.delete(deal).where(eq(deal.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [utilisateurId, autreUtilisateurId]));
    await db.delete(entreprise).where(inArray(entreprise.id, [entrepriseId, autreEntrepriseId]));
  }, 60_000);

  async function nouvelAcompte(ent: string, user: string, params: { contactId: string; dealId?: string; montant: number; paye: boolean }) {
    return avecEntreprise(ent, async (tx) => {
      const numero = await genererNumeroFactureAcompte(tx, ent);
      const [a] = await tx
        .insert(factureAcompte)
        .values({ entrepriseId: ent, numero, dealId: params.dealId ?? null, contactId: params.contactId, assigneAId: user, montant: params.montant, montantRestant: params.montant, creeParId: user, ...(params.paye ? { statut: "PAYEE" as const, moyenPaiement: "especes" as const, dateEncaissement: new Date() } : {}) })
        .returning();
      return a;
    });
  }
  async function nouvelleFacture(ent: string, user: string, params: { contactId: string; dealId?: string; ttc: number }) {
    return avecEntreprise(ent, async (tx) => {
      const numero = await genererNumeroFacture(tx, ent);
      const [f] = await tx
        .insert(facture)
        .values({ entrepriseId: ent, numero, dealId: params.dealId ?? null, contactId: params.contactId, assigneAId: user, montantHT: params.ttc, montantTVA: 0, montantTTC: params.ttc, dateEcheance: new Date() })
        .returning();
      return f;
    });
  }

  test("acompte encaissé alors que la facture est déjà émise : déduit, facture partiellement payée, reste à payer exact", async () => {
    const f = await nouvelleFacture(entrepriseId, utilisateurId, { contactId, dealId: dealA, ttc: 100_000 });
    const a = await nouvelAcompte(entrepriseId, utilisateurId, { contactId, dealId: dealA, montant: 30_000, paye: true });

    const deduit = await avecEntreprise(entrepriseId, (tx) => appliquerAcompteSurFacturesOuvertes(tx, entrepriseId, a.id));
    expect(deduit).toBe(30_000);

    await avecEntreprise(entrepriseId, async (tx) => {
      const [fApres] = await tx.select().from(facture).where(eq(facture.id, f.id));
      expect(fApres.statut).toBe("PARTIELLEMENT_PAYEE");
      expect((await lireSolde(tx, f.id, f.montantTTC)).solde).toBe(70_000);
      const reglements = await tx.select().from(paiement).where(eq(paiement.factureId, f.id));
      expect(reglements).toHaveLength(1);
      expect(numeroAcompteDeReference(reglements[0].referenceTransaction)).toBe(a.numero);
      const [aApres] = await tx.select().from(factureAcompte).where(eq(factureAcompte.id, a.id));
      expect(aApres.montantRestant).toBe(0);
      expect(aApres.statut).toBe("APPLIQUEE");
      const ecritures = await tx.select().from(ecritureComptable).where(eq(ecritureComptable.factureAcompteId, a.id));
      expect(ecritures.reduce((s, e) => s + e.debit, 0)).toBe(ecritures.reduce((s, e) => s + e.credit, 0));
    });
  }, 60_000);

  test("rien n'est déduit deux fois : rejouer l'application ne change rien", async () => {
    const c = await avecEntreprise(entrepriseId, async (tx) => (await tx.insert(contact).values({ entrepriseId, nom: "Client rejeu", telephone: "+237600000085", assigneAId: utilisateurId }).returning({ id: contact.id }))[0]);
    const f = await nouvelleFacture(entrepriseId, utilisateurId, { contactId: c.id, ttc: 40_000 });
    const a = await nouvelAcompte(entrepriseId, utilisateurId, { contactId: c.id, montant: 10_000, paye: true });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcompteSurFacturesOuvertes(tx, entrepriseId, a.id))).toBe(10_000);
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcompteSurFacturesOuvertes(tx, entrepriseId, a.id))).toBe(0);
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, f.id))).toBe(0);
    const solde = await avecEntreprise(entrepriseId, (tx) => lireSolde(tx, f.id, f.montantTTC));
    expect(solde.solde).toBe(30_000);
  }, 60_000);

  test("acompte déjà encaissé, facture émise ensuite : déduit à l'émission, et le surplus de l'acompte reste disponible", async () => {
    const a = await nouvelAcompte(entrepriseId, utilisateurId, { contactId: autreContactId, montant: 50_000, paye: true });
    const f = await nouvelleFacture(entrepriseId, utilisateurId, { contactId: autreContactId, ttc: 20_000 });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, f.id))).toBe(20_000);

    await avecEntreprise(entrepriseId, async (tx) => {
      const [fApres] = await tx.select().from(facture).where(eq(facture.id, f.id));
      expect(fApres.statut).toBe("PAYEE");
      const [aApres] = await tx.select().from(factureAcompte).where(eq(factureAcompte.id, a.id));
      expect(aApres.montantRestant).toBe(30_000);
      expect(aApres.statut).toBe("PAYEE");
    });

    // la facture suivante du même client reprend le reste de l'acompte
    const f2 = await nouvelleFacture(entrepriseId, utilisateurId, { contactId: autreContactId, ttc: 100_000 });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, f2.id))).toBe(30_000);
    expect((await avecEntreprise(entrepriseId, (tx) => lireSolde(tx, f2.id, f2.montantTTC))).solde).toBe(70_000);
  }, 60_000);

  test("un acompte non encaissé (émis seulement) ne déduit rien", async () => {
    const c = await avecEntreprise(entrepriseId, async (tx) => (await tx.insert(contact).values({ entrepriseId, nom: "Client non payé", telephone: "+237600000084", assigneAId: utilisateurId }).returning({ id: contact.id }))[0]);
    await nouvelAcompte(entrepriseId, utilisateurId, { contactId: c.id, montant: 25_000, paye: false });
    const f = await nouvelleFacture(entrepriseId, utilisateurId, { contactId: c.id, ttc: 25_000 });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, f.id))).toBe(0);
  }, 60_000);

  test("jamais d'un client à un autre, ni d'une affaire à une autre, ni d'une entreprise à une autre", async () => {
    const a = await nouvelAcompte(entrepriseId, utilisateurId, { contactId, dealId: dealA, montant: 15_000, paye: true });
    const autreAffaire = await nouvelleFacture(entrepriseId, utilisateurId, { contactId, dealId: dealB, ttc: 50_000 });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, autreAffaire.id))).toBe(0);

    const autreClient = await nouvelleFacture(entrepriseId, utilisateurId, { contactId: autreContactId, ttc: 50_000 });
    expect(await avecEntreprise(entrepriseId, (tx) => appliquerAcomptesSurFacture(tx, entrepriseId, autreClient.id))).toBe(0);

    const factureAutreEntreprise = await nouvelleFacture(autreEntrepriseId, autreUtilisateurId, { contactId: autreContactEntrepriseId, ttc: 50_000 });
    expect(await avecEntreprise(autreEntrepriseId, (tx) => appliquerAcomptesSurFacture(tx, autreEntrepriseId, factureAutreEntreprise.id))).toBe(0);
    // l'acompte de la première entreprise est intact
    const [aApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(factureAcompte).where(eq(factureAcompte.id, a.id)));
    expect(aApres.montantRestant).toBe(15_000);
  }, 60_000);

  test("extraireAcomptesDeduits regroupe par acompte et ignore les autres règlements", () => {
    expect(
      extraireAcomptesDeduits([
        { montant: 10_000, referenceTransaction: referenceAcompte("ACO-1") },
        { montant: 5_000, referenceTransaction: referenceAcompte("ACO-1") },
        { montant: 7_000, referenceTransaction: referenceAcompte("ACO-2") },
        { montant: 20_000, referenceTransaction: "fac_123" },
        { montant: 1_000, referenceTransaction: null },
      ])
    ).toEqual([
      { numero: "ACO-1", montant: 15_000 },
      { numero: "ACO-2", montant: 7_000 },
    ]);
  });
});
