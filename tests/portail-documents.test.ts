import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, facture, paiement } from "@/db/schema";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { lireDocumentsDuContact, trouverDevisDuContact, trouverFactureDuContact } from "@/lib/portail/documents";

/**
 * Portail client : un client ne voit que SES factures et SES devis (jamais ceux d'un autre client de la même entreprise ni d'une autre
 * entreprise), jamais un brouillon de devis, et ne peut ouvrir un document par son identifiant que s'il lui appartient.
 */
describe("Portail client — factures et devis", () => {
  let entrepriseId: string;
  let autreEntrepriseId: string;
  let utilisateurId: string;
  let autreUtilisateurId: string;
  let contactA: string;
  let contactB: string;
  let contactAutreEntreprise: string;
  let factureA: string;
  let factureB: string;
  let devisEnvoyeA: string;
  let devisBrouillonA: string;
  let devisB: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Portail Docs", secteurProfil: "agence", niu: "M012026000091" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [e2] = await db.insert(entreprise).values({ nom: "TEST Portail Docs B", secteurProfil: "agence", niu: "M012026000092" }).returning({ id: entreprise.id });
    autreEntrepriseId = e2.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `pd-${entrepriseId}@vertexone.test`, nomComplet: "Admin PD", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurId = u.id;
    const [u2] = await db.insert(utilisateur).values({ entrepriseId: autreEntrepriseId, email: `pd-${autreEntrepriseId}@vertexone.test`, nomComplet: "Admin PD B", role: "ADMIN" }).returning({ id: utilisateur.id });
    autreUtilisateurId = u2.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [a] = await tx.insert(contact).values({ entrepriseId, nom: "Client A", telephone: "+237600000091", assigneAId: utilisateurId }).returning({ id: contact.id });
      contactA = a.id;
      const [b] = await tx.insert(contact).values({ entrepriseId, nom: "Client B", telephone: "+237600000092", assigneAId: utilisateurId }).returning({ id: contact.id });
      contactB = b.id;
      const nouvelleFacture = async (contactId: string) => {
        const numero = await genererNumeroFacture(tx, entrepriseId);
        const [f] = await tx.insert(facture).values({ entrepriseId, numero, contactId, assigneAId: utilisateurId, montantHT: 100000, montantTVA: 0, montantTTC: 100000, dateEcheance: new Date() }).returning({ id: facture.id });
        return f.id;
      };
      factureA = await nouvelleFacture(a.id);
      factureB = await nouvelleFacture(b.id);
      await tx.insert(paiement).values({ entrepriseId, factureId: factureA, montant: 30000, moyenPaiement: "manuel" });
      const nouveauDevis = async (contactId: string, statut: "BROUILLON" | "ENVOYE", n: number) => {
        const [d] = await tx.insert(devis).values({ entrepriseId, numero: `DEV-TEST-PD-${entrepriseId.slice(0, 6)}-${n}`, contactId, assigneAId: utilisateurId, creeParId: utilisateurId, statut, montantHT: 50000, montantTVA: 0, montantTTC: 50000, dateValidite: new Date(Date.now() + 864e5) }).returning({ id: devis.id });
        return d.id;
      };
      devisEnvoyeA = await nouveauDevis(a.id, "ENVOYE", 1);
      devisBrouillonA = await nouveauDevis(a.id, "BROUILLON", 2);
      devisB = await nouveauDevis(b.id, "ENVOYE", 3);
    });
    await avecEntreprise(autreEntrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: autreEntrepriseId, nom: "Client Autre Entreprise", telephone: "+237600000093", assigneAId: autreUtilisateurId }).returning({ id: contact.id });
      contactAutreEntreprise = c.id;
    });
  }, 60_000);

  afterAll(async () => {
    for (const id of [entrepriseId, autreEntrepriseId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(paiement).where(eq(paiement.entrepriseId, id));
        await tx.delete(devis).where(eq(devis.entrepriseId, id));
        await tx.delete(facture).where(eq(facture.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(inArray(utilisateur.id, [utilisateurId, autreUtilisateurId]));
    await db.delete(entreprise).where(inArray(entreprise.id, [entrepriseId, autreEntrepriseId]));
  }, 60_000);

  test("le client voit ses factures avec le reste à payer, et ses devis sans les brouillons", async () => {
    const docs = await avecEntreprise(entrepriseId, (tx) => lireDocumentsDuContact(tx, contactA));
    expect(docs.factures.map((f) => f.id)).toEqual([factureA]);
    expect(docs.factures[0].solde).toBe(70000);
    expect(docs.devis.map((d) => d.id)).toEqual([devisEnvoyeA]);
  }, 60_000);

  test("jamais les documents d'un autre client, ni d'une autre entreprise", async () => {
    const docsB = await avecEntreprise(entrepriseId, (tx) => lireDocumentsDuContact(tx, contactB));
    expect(docsB.factures.map((f) => f.id)).toEqual([factureB]);
    expect(docsB.devis.map((d) => d.id)).toEqual([devisB]);
    const docsAutre = await avecEntreprise(autreEntrepriseId, (tx) => lireDocumentsDuContact(tx, contactA)); // le contact A n'existe pas dans cette entreprise
    expect(docsAutre.factures).toEqual([]);
    expect(docsAutre.devis).toEqual([]);
    const docsAutreEntreprise = await avecEntreprise(entrepriseId, (tx) => lireDocumentsDuContact(tx, contactAutreEntreprise));
    expect(docsAutreEntreprise.factures).toEqual([]);
  }, 60_000);

  test("ouvrir un document par son identifiant n'est possible que pour son propriétaire, et jamais un brouillon", async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      expect(await trouverFactureDuContact(tx, contactA, factureA)).toBe(factureA);
      expect(await trouverFactureDuContact(tx, contactA, factureB)).toBeNull();
      expect(await trouverDevisDuContact(tx, contactA, devisEnvoyeA)).toBe(devisEnvoyeA);
      expect(await trouverDevisDuContact(tx, contactA, devisB)).toBeNull();
      expect(await trouverDevisDuContact(tx, contactA, devisBrouillonA)).toBeNull();
    });
    await avecEntreprise(autreEntrepriseId, async (tx) => {
      expect(await trouverFactureDuContact(tx, contactAutreEntreprise, factureA)).toBeNull(); // la RLS de l'entreprise s'ajoute au filtre du contact
    });
  }, 60_000);
});
