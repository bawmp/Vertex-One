import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, tentativePaiementFacture } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Seuls les appels réseau vers Aangaraa Pay sont simulés : base, RLS, règlements et écritures comptables sont réels.
const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
const initierPaiementDirect = vi.fn<(p: { telephone: string; operateur: string; reference: string; montant: number }) => Promise<{ declenche: true; payToken: string | null } | { erreur: string }>>();
vi.mock("@/lib/aangaraa/client", async () => {
  const { moyenPaiementDepuisOperateur } = await import("@/lib/aangaraa/utilitaires");
  return {
    verifierTransaction: (t: string) => verifierTransaction(t),
    initierPaiementDirect: (p: Parameters<typeof initierPaiementDirect>[0]) => initierPaiementDirect(p),
    moyenPaiementDepuisOperateur,
  };
});

const { relireEtConfirmerFacture } = await import("@/lib/paiement/confirmation");
const { declencherPaiementDirectFacture } = await import("@/lib/facturation/paiement-en-ligne");
const { obtenirOuCreerLien } = await import("@/lib/client-documents/liens");
const { verifierPaiementFacturePublic, recupererPaiementFactureEnAttentePublic } = await import("@/lib/actions/client-documents");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST PaiementDirect A ${suffixe}`;
const nomB = `TEST PaiementDirect B ${suffixe}`;
let idA: string;
let idB: string;
let adminA: string;
let adminB: string;
let compteur = 0;

async function nouvelleFacture(entrepriseId: string, adminId: string): Promise<string> {
  compteur += 1;
  return avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client", telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-PD-${suffixe}-${compteur}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
      .returning({ id: facture.id });
    return f.id;
  });
}
async function nouvelleTentative(entrepriseId: string, factureId: string, extra: Partial<typeof tentativePaiementFacture.$inferInsert> = {}) {
  const [t] = await avecEntreprise(entrepriseId, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId, factureId, montant: 11925, ...extra }).returning({ id: tentativePaiementFacture.id }));
  return t.id;
}
const lireTentative = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, id)))[0]);
const lireFacture = (entrepriseId: string, id: string) => avecEntreprise(entrepriseId, async (tx) => ({ f: (await tx.select().from(facture).where(eq(facture.id, id)))[0], p: await tx.select().from(paiement).where(eq(paiement.factureId, id)) }));
const tentativesDe = (entrepriseId: string, factureId: string) => avecEntreprise(entrepriseId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.factureId, factureId)));
const accepte = (id: string, montant = 11925): ResultatVerification => ({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${id}`, montant, operateur: "MTN_Cameroon" });

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => {
  verifierTransaction.mockReset();
  initierPaiementDirect.mockReset();
});

describe("Paiement direct d'une facture — déclenchement", () => {
  test("le montant vient de la base, le payToken est conservé, la référence est celle de la tentative", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    initierPaiementDirect.mockResolvedValue({ declenche: true, payToken: "MP26.1111.A11111" });
    const r = await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId, returnUrl: "https://exemple.test/f", telephone: "690 11 12 22", operateur: "MTN_Cameroon" }));
    expect(r.erreur).toBeUndefined();
    const appel = initierPaiementDirect.mock.calls[0][0];
    expect(appel.montant).toBe(11925);
    expect(appel.telephone).toBe("+237690111222");
    expect(appel.operateur).toBe("MTN_Cameroon");
    expect(appel.reference).toBe(`fac_${r.tentativeId}`); // jamais l'id de la facture
    expect((await lireTentative(idA, r.tentativeId!)).payToken).toBe("MP26.1111.A11111");
  }, 180_000);

  test("téléphone ou opérateur invalide : refusé sans créer de tentative ni appeler le prestataire", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    const essai = (telephone: string, operateur: unknown) => avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId, returnUrl: "x", telephone, operateur }));
    expect((await essai("12", "MTN_Cameroon")).erreur).toBeTruthy();
    expect((await essai("690111222", "ALL")).erreur).toBeTruthy();
    expect((await essai("690111222", undefined)).erreur).toBeTruthy();
    expect(initierPaiementDirect).not.toHaveBeenCalled();
    expect(await tentativesDe(idA, factureId)).toHaveLength(0);
  }, 180_000);

  test("une facture déjà payée ou d'une autre entreprise n'est jamais encaissable", async () => {
    const payee = await nouvelleFacture(idA, adminA);
    await avecEntreprise(idA, (tx) => tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, payee)));
    const deB = await nouvelleFacture(idB, adminB);
    const essai = (factureId: string) => avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon" }));
    expect((await essai(payee)).erreur).toBeTruthy();
    expect((await essai(deB)).erreur).toBeTruthy(); // RLS : la facture de B est invisible depuis A
    expect(initierPaiementDirect).not.toHaveBeenCalled();
    expect(await tentativesDe(idB, deB)).toHaveLength(0);
  }, 180_000);

  test("garde-fou : pas de seconde invite pendant qu'une est en attente, et au plus 5 tentatives par heure", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    initierPaiementDirect.mockResolvedValue({ declenche: true, payToken: "MP26.2222.B22222" });
    const essai = () => avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon" }));
    expect((await essai()).tentativeId).toBeTruthy();
    expect((await essai()).erreur).toMatch(/déjà en cours/); // double clic
    expect(initierPaiementDirect).toHaveBeenCalledTimes(1);

    const autre = await nouvelleFacture(idA, adminA);
    for (let i = 0; i < 5; i++) await nouvelleTentative(idA, autre, { statut: "ECHEC", creeLe: new Date(Date.now() - 600_000) });
    const r = await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId: autre, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon" }));
    expect(r.erreur).toMatch(/Trop de tentatives/);
  }, 180_000);

  test("le prestataire refuse l'initiation : la tentative est marquée en échec", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    initierPaiementDirect.mockResolvedValue({ erreur: "Impossible de déclencher le paiement pour le moment." });
    const r = await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon" }));
    expect(r.erreur).toBeTruthy();
    const [t] = await tentativesDe(idA, factureId);
    expect(t.statut).toBe("ECHEC");
  }, 180_000);
});

describe("Paiement direct d'une facture — relecture active", () => {
  test("accepté : UN règlement, facture payée, et un second appel ne duplique rien", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, factureId, { payToken: "MP26.3333.C33333" });
    verifierTransaction.mockResolvedValue(accepte(id));
    expect(await relireEtConfirmerFacture(id)).toBe("CONFIRME");
    expect(await relireEtConfirmerFacture(id)).toBe("CONFIRME");
    const { f, p } = await lireFacture(idA, factureId);
    expect(f.statut).toBe("PAYEE");
    expect(p).toHaveLength(1);
  }, 180_000);

  test("refusé : échec avec la raison du prestataire, facture toujours due", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, factureId, { payToken: "MP26.4444.D44444" });
    verifierTransaction.mockResolvedValue({ statut: "REFUSED", indisponible: false, referenceExterne: `fac_${id}`, montant: 11925, raisonEchec: "SOLDE_OU_COMPTE" });
    expect(await relireEtConfirmerFacture(id)).toBe("ECHEC");
    expect((await lireTentative(idA, id)).raisonEchec).toBe("SOLDE_OU_COMPTE");
    expect((await lireFacture(idA, factureId)).f.statut).toBe("EMISE");
  }, 180_000);

  test("sans payToken : rien à relire, le prestataire n'est pas interrogé ; prestataire indisponible : on réessaiera", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    const sans = await nouvelleTentative(idA, factureId);
    expect(await relireEtConfirmerFacture(sans)).toBe("EN_ATTENTE");
    expect(verifierTransaction).not.toHaveBeenCalled();
    const avec = await nouvelleTentative(idA, factureId, { payToken: "MP26.5555.E55555" });
    verifierTransaction.mockResolvedValue({ statut: "INCONNU", indisponible: true });
    expect(await relireEtConfirmerFacture(avec)).toBe("INDISPONIBLE");
    expect(await relireEtConfirmerFacture("tentative-inconnue")).toBe("INTROUVABLE");
  }, 180_000);

  test("un montant différent de la tentative n'est jamais confirmé", async () => {
    const factureId = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, factureId, { payToken: "MP26.6666.F66666" });
    verifierTransaction.mockResolvedValue(accepte(id, 100));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await relireEtConfirmerFacture(id)).toBe("EN_ATTENTE");
    expect((await lireFacture(idA, factureId)).f.statut).toBe("EMISE");
  }, 180_000);
});

describe("Paiement direct d'une facture — page publique du client", () => {
  test("le sondage n'accepte qu'une tentative de CETTE facture : jamais celle d'une autre facture ni d'une autre entreprise", async () => {
    const maFacture = await nouvelleFacture(idA, adminA);
    const jeton = await avecEntreprise(idA, (tx) => obtenirOuCreerLien(tx, idA, { factureId: maFacture }));
    const mienne = await nouvelleTentative(idA, maFacture, { payToken: "MP26.7777.G77777" });
    const autreFacture = await nouvelleFacture(idA, adminA);
    const autreTentative = await nouvelleTentative(idA, autreFacture, { payToken: "MP26.8888.H88888" });
    const factureB = await nouvelleFacture(idB, adminB);
    const tentativeB = await nouvelleTentative(idB, factureB, { payToken: "MP26.9999.I99999" });

    verifierTransaction.mockResolvedValue(accepte(mienne));
    expect((await verifierPaiementFacturePublic(jeton, mienne)).statut).toBe("CONFIRME");

    verifierTransaction.mockClear();
    expect((await verifierPaiementFacturePublic(jeton, autreTentative)).statut).toBe("INTROUVABLE");
    expect((await verifierPaiementFacturePublic(jeton, tentativeB)).statut).toBe("INTROUVABLE");
    expect((await verifierPaiementFacturePublic("x".repeat(32), mienne)).statut).toBe("INTROUVABLE");
    expect(verifierTransaction).not.toHaveBeenCalled(); // jamais de relecture pour une tentative qui n'est pas la sienne
    expect((await lireFacture(idA, autreFacture)).f.statut).toBe("EMISE");
    expect((await lireFacture(idB, factureB)).f.statut).toBe("EMISE");
  }, 180_000);

  test("la reprise après rechargement ne renvoie que la tentative récente en attente de CETTE facture", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const jeton = await avecEntreprise(idA, (tx) => obtenirOuCreerLien(tx, idA, { factureId: f }));
    expect(await recupererPaiementFactureEnAttentePublic(jeton)).toBeNull();
    await nouvelleTentative(idA, f, { payToken: "MP26.1212.J12121", creeLe: new Date(Date.now() - 20 * 60_000) }); // trop ancienne
    expect(await recupererPaiementFactureEnAttentePublic(jeton)).toBeNull();
    const recente = await nouvelleTentative(idA, f, { payToken: "MP26.1313.K13131" });
    expect(await recupererPaiementFactureEnAttentePublic(jeton)).toEqual({ tentativeId: recente });
    expect(await recupererPaiementFactureEnAttentePublic("y".repeat(32))).toBeNull();
    // Isolation : rien de tout cela n'a touché les règlements de l'entreprise B.
    expect(await avecEntreprise(idB, (tx) => tx.select().from(paiement).where(and(eq(paiement.entrepriseId, idB))))).toHaveLength(0);
  }, 180_000);
});
