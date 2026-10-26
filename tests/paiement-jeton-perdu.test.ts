import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, tentativePaiementFacture } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/client", () => ({ envoyerEmail: async () => ({ envoye: true }) }));
const taches = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => { taches.push(Promise.resolve().then(f)); } }));
const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
vi.mock("@/lib/aangaraa/client", async () => {
  const { moyenPaiementDepuisOperateur } = await import("@/lib/aangaraa/utilitaires");
  return { verifierTransaction: (t: string) => verifierTransaction(t), moyenPaiementDepuisOperateur };
});

const { traiterNotificationPaiement, relireEtConfirmerFacture } = await import("@/lib/paiement/confirmation");

const suffixe = Math.random().toString(36).slice(2, 8);
const nom = `TEST JetonPerdu ${suffixe}`;
let idEntreprise = "";
let adminId = "";
let compteur = 0;
const TOKEN = "MP26.8801.L88011";

async function nouvelleTentative(extra: Partial<typeof tentativePaiementFacture.$inferInsert> = {}) {
  compteur += 1;
  return avecEntreprise(idEntreprise, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId: idEntreprise, nom: "Client", telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId: idEntreprise, numero: `FAC-JP-${suffixe}-${compteur}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
      .returning({ id: facture.id });
    const [t] = await tx.insert(tentativePaiementFacture).values({ entrepriseId: idEntreprise, factureId: f.id, montant: 11925, statut: "ECHEC", ...extra }).returning({ id: tentativePaiementFacture.id });
    return { tentativeId: t.id, factureId: f.id };
  });
}
const lireTentative = (id: string) => avecEntreprise(idEntreprise, async (tx) => (await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, id)))[0]);
const lireFacture = (id: string) => avecEntreprise(idEntreprise, async (tx) => (await tx.select().from(facture).where(eq(facture.id, id)))[0]);
const pending = (id: string): ResultatVerification => ({ statut: "PENDING", indisponible: false, referenceExterne: `fac_${id}`, montant: 11925 });
const accepte = (id: string): ResultatVerification => ({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${id}`, montant: 11925, operateur: "MTN_Cameroon" });

beforeAll(async () => {
  const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idEntreprise = e.id;
  [{ id: adminId }] = await db.insert(utilisateur).values({ entrepriseId: idEntreprise, email: `admin-${suffixe}@vertexone.test`, nomComplet: "Admin", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
}, 180_000);
afterAll(async () => {
  await supprimerEntrepriseDeTest(nom);
}, 180_000);
beforeEach(() => {
  verifierTransaction.mockReset();
  taches.length = 0;
});

describe("réponse d'initiation perdue : la notification rattrape le paiement d'une facture", () => {
  test("tentative marquée « échec » sans jeton : la notification garde le jeton et la remet en attente, puis la relecture règle la facture", async () => {
    const { tentativeId, factureId } = await nouvelleTentative();
    verifierTransaction.mockResolvedValue(pending(tentativeId));
    expect((await traiterNotificationPaiement({ payToken: TOKEN })).code).toBe(200);
    expect(await lireTentative(tentativeId)).toMatchObject({ payToken: TOKEN, statut: "EN_ATTENTE", raisonEchec: null });

    verifierTransaction.mockResolvedValue(accepte(tentativeId));
    expect(await relireEtConfirmerFacture(tentativeId)).toBe("CONFIRME");
    await Promise.all(taches.splice(0));
    expect((await lireFacture(factureId)).statut).toBe("PAYEE");
  }, 240_000);

  test("une notification déjà « acceptée » règle directement la facture d'une tentative marquée « échec » par erreur", async () => {
    const { tentativeId, factureId } = await nouvelleTentative();
    verifierTransaction.mockResolvedValue(accepte(tentativeId));
    await traiterNotificationPaiement({ payToken: TOKEN });
    await Promise.all(taches.splice(0));
    expect((await lireTentative(tentativeId)).statut).toBe("CONFIRME");
    expect((await lireFacture(factureId)).statut).toBe("PAYEE");
  }, 240_000);

  test("un échec venu du prestataire (jeton déjà connu) n'est JAMAIS rouvert", async () => {
    const { tentativeId } = await nouvelleTentative({ payToken: "MP26.0000.OLD001", raisonEchec: "SOLDE_OU_COMPTE" });
    verifierTransaction.mockResolvedValue(pending(tentativeId));
    await traiterNotificationPaiement({ payToken: TOKEN });
    expect(await lireTentative(tentativeId)).toMatchObject({ payToken: "MP26.0000.OLD001", statut: "ECHEC", raisonEchec: "SOLDE_OU_COMPTE" });
  }, 240_000);

  test("un paiement refusé, ou d'un autre montant, ne rouvre ni ne règle rien", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refuse = await nouvelleTentative();
    verifierTransaction.mockResolvedValue({ statut: "REFUSED", indisponible: false, referenceExterne: `fac_${refuse.tentativeId}`, montant: 11925 });
    await traiterNotificationPaiement({ payToken: TOKEN });
    expect((await lireTentative(refuse.tentativeId)).statut).toBe("ECHEC");

    const autre = await nouvelleTentative();
    verifierTransaction.mockResolvedValue({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${autre.tentativeId}`, montant: 100 });
    await traiterNotificationPaiement({ payToken: TOKEN });
    expect((await lireFacture(autre.factureId)).statut).not.toBe("PAYEE");
  }, 240_000);
});
