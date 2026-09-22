import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, tentativePaiementFacture, tentativePaiementAbonnement } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));

// Seul l'appel réseau vers Aangaraa Pay est simulé : tout le reste (base, RLS, écritures comptables) est réel.
const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
vi.mock("@/lib/aangaraa/client", async () => {
  // La logique pure (opérateur → mode de paiement) reste la vraie ; seul l'appel réseau est remplacé.
  const { moyenPaiementDepuisOperateur } = await import("@/lib/aangaraa/utilitaires");
  return { verifierTransaction: (payToken: string) => verifierTransaction(payToken), moyenPaiementDepuisOperateur };
});

const { traiterNotificationPaiement } = await import("@/lib/paiement/confirmation");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Aangaraa A ${suffixe}`;
const nomB = `TEST Aangaraa B ${suffixe}`;
const PAY_TOKEN = "MP260921.1234.A56789";

let idA: string;
let idB: string;
let factureA: string;
let factureB: string;
let contactA: string;

const accepte = (referenceExterne: string, montant: number, operateur = "MTN_Cameroon"): ResultatVerification => ({ statut: "ACCEPTED", indisponible: false, referenceExterne, montant, operateur });

async function nouvelleTentativeFacture(entrepriseId: string, factureId: string, montant: number) {
  const [t] = await avecEntreprise(entrepriseId, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId, factureId, montant }).returning({ id: tentativePaiementFacture.id }));
  return t.id;
}
const lireFacture = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => ({ f: (await tx.select().from(facture).where(eq(facture.id, id)))[0], p: await tx.select().from(paiement).where(eq(paiement.factureId, id)) }));

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const [uA] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
  const [uB] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
  const creerFacture = async (entrepriseId: string, adminId: string, numero: string) =>
    avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client", telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
      const [f] = await tx
        .insert(facture)
        .values({ entrepriseId, numero, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
        .returning({ id: facture.id });
      return { contactId: c.id, factureId: f.id };
    });
  const ra = await creerFacture(idA, uA.id, `FAC-AP-A-${suffixe}`);
  const rb = await creerFacture(idB, uB.id, `FAC-AP-B-${suffixe}`);
  factureA = ra.factureId;
  contactA = ra.contactId;
  factureB = rb.factureId;
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => verifierTransaction.mockReset());

describe("Aangaraa Pay — confirmation d'un paiement de facture", () => {
  test("un paiement accepté crée UN règlement, passe la facture à payée, confirme la tentative, et garde l'opérateur", async () => {
    const tentative = await nouvelleTentativeFacture(idA, factureA, 11925);
    verifierTransaction.mockResolvedValue(accepte(`fac_${tentative}`, 11925, "Orange_Cameroon"));

    const issue = await traiterNotificationPaiement({ payToken: PAY_TOKEN });
    expect(issue.code).toBe(200);

    const { f, p } = await lireFacture(idA, factureA);
    expect(f.statut).toBe("PAYEE");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ montant: 11925, moyenPaiement: "orange_money", referenceTransaction: tentative });
    const [t] = await avecEntreprise(idA, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentative)));
    expect(t.statut).toBe("CONFIRME");

    // Aangaraa Pay rappelle la même notification : rien ne se duplique.
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    expect((await lireFacture(idA, factureA)).p).toHaveLength(1);
  }, 180_000);

  test("un montant différent de celui de la tentative n'est jamais confirmé", async () => {
    const [{ id: autre }] = await avecEntreprise(idB, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId: idB, factureId: factureB, montant: 11925 }).returning({ id: tentativePaiementFacture.id }));
    verifierTransaction.mockResolvedValue(accepte(`fac_${autre}`, 100));
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    const { f, p } = await lireFacture(idB, factureB);
    expect(f.statut).toBe("EMISE");
    expect(p).toHaveLength(0);
    const [t] = await avecEntreprise(idB, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, autre)));
    expect(t.statut).toBe("EN_ATTENTE");
  }, 180_000);

  test("un échec chez Aangaraa Pay marque la tentative en échec, la facture reste due", async () => {
    const tentative = await nouvelleTentativeFacture(idB, factureB, 11925);
    verifierTransaction.mockResolvedValue({ statut: "REFUSED", indisponible: false, referenceExterne: `fac_${tentative}`, montant: 11925 });
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    const [t] = await avecEntreprise(idB, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentative)));
    expect(t.statut).toBe("ECHEC");
    expect((await lireFacture(idB, factureB)).f.statut).toBe("EMISE");
  }, 180_000);

  test("un paiement en attente ne change rien (Aangaraa Pay rappellera)", async () => {
    const tentative = await nouvelleTentativeFacture(idB, factureB, 11925);
    verifierTransaction.mockResolvedValue({ statut: "PENDING", indisponible: false, referenceExterne: `fac_${tentative}`, montant: 11925 });
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    expect((await lireFacture(idB, factureB)).f.statut).toBe("EMISE");
  }, 180_000);

  test("facture déjà réglée à la main entre-temps : la tentative est confirmée, aucun second règlement", async () => {
    const tentative = await nouvelleTentativeFacture(idA, factureA, 11925); // factureA est déjà PAYEE (premier test)
    verifierTransaction.mockResolvedValue(accepte(`fac_${tentative}`, 11925));
    await traiterNotificationPaiement({ payToken: PAY_TOKEN });
    expect((await lireFacture(idA, factureA)).p).toHaveLength(1);
  }, 180_000);
});

describe("Aangaraa Pay — refus en amont", () => {
  test("paytoken absent : 400, sans interroger le prestataire", async () => {
    expect((await traiterNotificationPaiement({ payToken: null })).code).toBe(400);
    expect(verifierTransaction).not.toHaveBeenCalled();
  });

  test("prestataire injoignable ou clé refusée : 503, pour qu'il rappelle plus tard au lieu de perdre le paiement", async () => {
    verifierTransaction.mockResolvedValue({ statut: "INCONNU", indisponible: true });
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(503);
  });

  test("transaction sans référence reconnue : 404 ; tentative inexistante : rien n'est modifié", async () => {
    verifierTransaction.mockResolvedValue(accepte("sans-prefixe", 11925));
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(404);
    verifierTransaction.mockResolvedValue(accepte("fac_identifiant-inexistant", 11925));
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    expect((await lireFacture(idB, factureB)).p).toHaveLength(0);
  }, 180_000);

  test("un paiement par carte est enregistré comme virement (même compte bancaire), jamais comme Mobile Money", async () => {
    const [{ id: carte }] = await avecEntreprise(idB, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId: idB, factureId: factureB, montant: 11925 }).returning({ id: tentativePaiementFacture.id }));
    verifierTransaction.mockResolvedValue(accepte(`fac_${carte}`, 11925, "CARTE"));
    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    const { p } = await lireFacture(idB, factureB);
    expect(p).toHaveLength(1);
    expect(p[0].moyenPaiement).toBe("virement");
  }, 180_000);
});

describe("Aangaraa Pay — abonnement à Vertex One", () => {
  test("un paiement d'abonnement accepté réactive l'entreprise et repousse l'échéance ; un rappel ne la repousse pas deux fois", async () => {
    await db.update(entreprise).set({ statutAbonnement: "suspendu", abonnementEcheanceLe: new Date(Date.now() - 5 * 86_400_000) }).where(eq(entreprise.id, idB));
    const [t] = await avecEntreprise(idB, (tx) => tx.insert(tentativePaiementAbonnement).values({ entrepriseId: idB, montant: 50000 }).returning({ id: tentativePaiementAbonnement.id }));
    verifierTransaction.mockResolvedValue(accepte(`abo_${t.id}`, 50000));

    expect((await traiterNotificationPaiement({ payToken: PAY_TOKEN })).code).toBe(200);
    const [apres] = await db.select().from(entreprise).where(eq(entreprise.id, idB));
    expect(apres.statutAbonnement).toBe("actif");
    expect(apres.abonnementEcheanceLe!.getTime()).toBeGreaterThan(Date.now());

    await traiterNotificationPaiement({ payToken: PAY_TOKEN });
    const [encore] = await db.select().from(entreprise).where(eq(entreprise.id, idB));
    expect(encore.abonnementEcheanceLe!.getTime()).toBe(apres.abonnementEcheanceLe!.getTime());
  }, 180_000);

  test("un montant d'abonnement inattendu n'active rien", async () => {
    await db.update(entreprise).set({ statutAbonnement: "suspendu" }).where(eq(entreprise.id, idA));
    const [t] = await avecEntreprise(idA, (tx) => tx.insert(tentativePaiementAbonnement).values({ entrepriseId: idA, montant: 50000 }).returning({ id: tentativePaiementAbonnement.id }));
    verifierTransaction.mockResolvedValue(accepte(`abo_${t.id}`, 25));
    await traiterNotificationPaiement({ payToken: PAY_TOKEN });
    const [apres] = await db.select().from(entreprise).where(eq(entreprise.id, idA));
    expect(apres.statutAbonnement).toBe("suspendu");
  }, 180_000);
});

describe("Aangaraa Pay — isolation entre entreprises", () => {
  test("la confirmation d'une tentative de A ne touche jamais les factures de B", async () => {
    const avant = (await lireFacture(idB, factureB)).f.statut;
    const tentative = await nouvelleTentativeFacture(idA, factureA, 11925);
    verifierTransaction.mockResolvedValue(accepte(`fac_${tentative}`, 11925));
    await traiterNotificationPaiement({ payToken: PAY_TOKEN });
    expect((await lireFacture(idB, factureB)).f.statut).toBe(avant);
    expect(contactA).toBeTruthy();
  }, 180_000);
});
