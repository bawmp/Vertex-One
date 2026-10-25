import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, tentativePaiementFacture } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock("@/lib/i18n/langue", () => ({ getT: async () => Object.assign((texte: string) => texte, { locale: "fr-FR" }) }));
let connecte: { utilisateurId: string; entrepriseId: string; role: string } | null = null;
vi.mock("@/lib/session", () => ({ recupererUtilisateurConnecte: async () => connecte }));

// Seuls les appels réseau vers Aangaraa Pay sont simulés : base, RLS, règlements et écritures comptables sont réels.
const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
const initierPaiementDirect = vi.fn<(p: { telephone: string; operateur: string; reference: string; montant: number; description: string }) => Promise<{ declenche: true; payToken: string | null } | { erreur: string }>>();
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
const { marquerFacturePayee } = await import("@/lib/actions/facture");
const { definirPaiementEnTranches } = await import("@/lib/actions/entreprise-branding");
const { recupererFacturePourClient } = await import("@/lib/pdf/donnees");
const { gabaritRelanceFacture } = await import("@/lib/email/gabarits");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST Tranches A ${suffixe}`;
const nomB = `TEST Tranches B ${suffixe}`;
let idA = "", idB = "", adminA = "", employeA = "", adminB = "";
let compteur = 0;
let jeton = 0;

async function nouvelleFacture(entrepriseId: string, adminId: string, statut: "EMISE" | "EN_RETARD" = "EMISE"): Promise<string> {
  compteur += 1;
  return avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client", telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-TR-${suffixe}-${compteur}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925, statut })
      .returning({ id: facture.id });
    return f.id;
  });
}
const lire = (entrepriseId: string, id: string) =>
  avecEntreprise(entrepriseId, async (tx) => ({ f: (await tx.select().from(facture).where(eq(facture.id, id)))[0], p: await tx.select().from(paiement).where(eq(paiement.factureId, id)) }));
const somme = (p: { montant: number }[]) => p.reduce((s, x) => s + x.montant, 0);

/** Déclenche une tentative de `montant` (ou tout le solde) puis la fait confirmer par le prestataire simulé. */
async function payer(entrepriseId: string, factureId: string, montant?: number) {
  jeton += 1;
  initierPaiementDirect.mockResolvedValueOnce({ declenche: true, payToken: `MP26.${String(jeton).padStart(4, "0")}.T${String(jeton).padStart(5, "0")}` });
  const r = await avecEntreprise(entrepriseId, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId, factureId, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant }));
  if (r.erreur || !r.tentativeId) return { ...r, statut: undefined as string | undefined };
  verifierTransaction.mockResolvedValueOnce({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${r.tentativeId}`, montant: r.montant, operateur: "MTN_Cameroon" });
  // Aucune seconde invite avant 90 s : on « vieillit » la tentative pour enchaîner les tranches comme le ferait un client patient.
  const statut = await relireEtConfirmerFacture(r.tentativeId);
  await avecEntreprise(entrepriseId, (tx) => tx.update(tentativePaiementFacture).set({ creeLe: new Date(Date.now() - 10 * 60_000) }).where(eq(tentativePaiementFacture.id, r.tentativeId!)));
  return { ...r, statut };
}

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }, { id: employeA }] = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: `admin-a-${suffixe}@vertexone.test`, nomComplet: "Admin A", role: "ADMIN" },
      { entrepriseId: idA, email: `employe-a-${suffixe}@vertexone.test`, nomComplet: "Employe A", role: "EMPLOYE" },
    ])
    .returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN" }).returning({ id: utilisateur.id });
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => {
  verifierTransaction.mockReset();
  initierPaiementDirect.mockReset();
  connecte = null;
});

describe("Paiement en plusieurs fois — tranches", () => {
  test("deux tranches : « partiellement payée » puis « payée », un règlement par tranche, jamais plus que le total", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const premiere = await payer(idA, f, 5000);
    expect(premiere.statut).toBe("CONFIRME");
    let { f: apres, p } = await lire(idA, f);
    expect(apres.statut).toBe("PARTIELLEMENT_PAYEE");
    expect(somme(p)).toBe(5000);
    expect(initierPaiementDirect.mock.calls[0][0]).toMatchObject({ montant: 5000, description: expect.stringContaining("tranche") });

    const seconde = await payer(idA, f); // sans montant : tout ce qui reste
    expect(seconde.statut).toBe("CONFIRME");
    expect(initierPaiementDirect.mock.calls[1][0].montant).toBe(6925);
    ({ f: apres, p } = await lire(idA, f));
    expect(apres.statut).toBe("PAYEE");
    expect(p).toHaveLength(2);
    expect(somme(p)).toBe(11925);

    const encore = await payer(idA, f, 1000); // facture soldée : plus rien à encaisser
    expect(encore.erreur).toBeTruthy();
    expect(somme((await lire(idA, f)).p)).toBe(11925);
  }, 240_000);

  test("une tranche sur une facture déjà en retard la laisse « en retard »", async () => {
    const f = await nouvelleFacture(idA, adminA, "EN_RETARD");
    await payer(idA, f, 3000);
    expect((await lire(idA, f)).f.statut).toBe("EN_RETARD");
    await payer(idA, f);
    expect((await lire(idA, f)).f.statut).toBe("PAYEE");
  }, 240_000);

  test("montants refusés côté serveur : trop élevé, trop petit, fractionnaire — aucune tentative créée, aucun appel au prestataire", async () => {
    const f = await nouvelleFacture(idA, adminA);
    for (const mauvais of [11926, 500, 1500.5, 0, -1000]) {
      const r = await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId: f, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant: mauvais }));
      expect(r.erreur, String(mauvais)).toBeTruthy();
    }
    expect(initierPaiementDirect).not.toHaveBeenCalled();
    expect(await avecEntreprise(idA, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.factureId, f)))).toHaveLength(0);
  }, 240_000);

  test("un montant déjà réservé par une tentative en attente n'est plus disponible", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await avecEntreprise(idA, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId: idA, factureId: f, montant: 8000, creeLe: new Date(Date.now() - 3 * 60_000) }));
    const essai = (montant?: number) => avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId: f, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant }));
    expect((await essai(5000)).erreur).toMatch(/dépasse le solde/);
    initierPaiementDirect.mockResolvedValueOnce({ declenche: true, payToken: "MP26.7001.R70001" });
    expect((await essai(3925)).montant).toBe(3925);
  }, 240_000);

  test("tranches désactivées par l'entreprise : seul le solde entier est accepté ; l'autre entreprise n'est pas touchée", async () => {
    await db.update(entreprise).set({ paiementEnTranches: false }).where(eq(entreprise.id, idB));
    const f = await nouvelleFacture(idB, adminB);
    const essai = (montant?: number) => avecEntreprise(idB, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idB, factureId: f, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant }));
    expect((await essai(5000)).erreur).toMatch(/plusieurs fois/);
    expect(initierPaiementDirect).not.toHaveBeenCalled();
    initierPaiementDirect.mockResolvedValueOnce({ declenche: true, payToken: "MP26.7002.R70002" });
    expect((await essai(11925)).montant).toBe(11925);
    // A (réglage par défaut) accepte toujours une tranche.
    const fA = await nouvelleFacture(idA, adminA);
    initierPaiementDirect.mockResolvedValueOnce({ declenche: true, payToken: "MP26.7003.R70003" });
    expect((await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId: fA, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant: 4000 }))).montant).toBe(4000);
  }, 240_000);

  test("une tentative confirmée avec un autre montant que celui de la tranche n'est jamais enregistrée", async () => {
    const f = await nouvelleFacture(idA, adminA);
    initierPaiementDirect.mockResolvedValueOnce({ declenche: true, payToken: "MP26.7004.R70004" });
    const r = await avecEntreprise(idA, (tx) => declencherPaiementDirectFacture(tx, { entrepriseId: idA, factureId: f, returnUrl: "x", telephone: "690111222", operateur: "MTN_Cameroon", montant: 4000 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifierTransaction.mockResolvedValueOnce({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${r.tentativeId}`, montant: 11925, operateur: "MTN_Cameroon" });
    expect(await relireEtConfirmerFacture(r.tentativeId!)).toBe("EN_ATTENTE");
    expect((await lire(idA, f)).p).toHaveLength(0);
  }, 240_000);
});

describe("Paiement en plusieurs fois — pointage manuel, page client, relance", () => {
  test("« Marquer comme payée » après une tranche règle uniquement le solde (rien n'est compté deux fois)", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await payer(idA, f, 5000);
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    await marquerFacturePayee(f);
    const { f: apres, p } = await lire(idA, f);
    expect(apres.statut).toBe("PAYEE");
    expect(p).toHaveLength(2);
    expect(somme(p)).toBe(11925);
    expect(p.find((x) => x.moyenPaiement === "manuel")?.montant).toBe(6925);
  }, 240_000);

  test("la page du client reçoit ce qui est déjà payé, le solde et le réglage de l'entreprise", async () => {
    const f = await nouvelleFacture(idA, adminA);
    await payer(idA, f, 2500);
    const donnees = await avecEntreprise(idA, (tx) => recupererFacturePourClient(tx, idA, f));
    expect(donnees).toMatchObject({ paye: 2500, solde: 9425, tranchesAutorisees: true });
    const deB = await nouvelleFacture(idB, adminB);
    const donneesB = await avecEntreprise(idB, (tx) => recupererFacturePourClient(tx, idB, deB));
    expect(donneesB).toMatchObject({ paye: 0, solde: 11925, tranchesAutorisees: false });
    // Isolation : A ne lit pas la facture de B.
    expect(await avecEntreprise(idA, (tx) => recupererFacturePourClient(tx, idA, deB))).toBeNull();
  }, 240_000);

  test("le réglage « paiement en plusieurs fois » : réservé à qui peut modifier les paramètres, propre à chaque entreprise", async () => {
    connecte = { utilisateurId: employeA, entrepriseId: idA, role: "EMPLOYE" };
    expect(await definirPaiementEnTranches(false)).toHaveProperty("erreur");
    const lireReglage = async (id: string) => (await db.select({ v: entreprise.paiementEnTranches }).from(entreprise).where(eq(entreprise.id, id)))[0].v;
    expect(await lireReglage(idA)).toBe(true);
    connecte = { utilisateurId: adminA, entrepriseId: idA, role: "ADMIN" };
    expect(await definirPaiementEnTranches(false)).toBeNull();
    expect(await lireReglage(idA)).toBe(false);
    expect(await lireReglage(idB)).toBe(false); // B l'avait déjà désactivé plus haut : inchangé, jamais touché par l'action de A
    expect(await definirPaiementEnTranches(true)).toBeNull();
    expect(await lireReglage(idA)).toBe(true);
    connecte = null;
    await expect(definirPaiementEnTranches(false)).rejects.toThrow("REDIRECT /connexion");
  }, 240_000);

  test("la relance annonce le montant restant quand des tranches ont été payées", () => {
    const complet = gabaritRelanceFacture({ nomClient: "Linda", numeroFacture: "FAC-1", montantTTC: 11925, dateEcheance: new Date(), nomEntreprise: "X" });
    expect(complet.html).not.toContain("il reste");
    const partiel = gabaritRelanceFacture({ nomClient: "Linda", numeroFacture: "FAC-1", montantTTC: 11925, montantRestant: 6925, dateEcheance: new Date(), nomEntreprise: "X" });
    expect(partiel.html).toContain("il reste");
    expect(partiel.html).toMatch(/6[\s  ]925/);
  });
});
