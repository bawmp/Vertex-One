import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, paiement, tentativePaiementFacture } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

vi.mock("server-only", () => ({}));
// L'envoi part « après la réponse » : ici, tout de suite, pour pouvoir l'observer.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => { void f(); } }));

const envoyerEmail = vi.fn<(p: { to: string; subject: string; html: string }) => Promise<{ envoye: boolean; erreur?: string }>>();
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: { to: string; subject: string; html: string }) => envoyerEmail(p) }));

const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
vi.mock("@/lib/aangaraa/client", async () => {
  const { moyenPaiementDepuisOperateur } = await import("@/lib/aangaraa/utilitaires");
  return { verifierTransaction: (t: string) => verifierTransaction(t), moyenPaiementDepuisOperateur };
});

const { relireEtConfirmerFacture, traiterNotificationPaiement } = await import("@/lib/paiement/confirmation");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST NotifPaiement A ${suffixe}`;
const nomB = `TEST NotifPaiement B ${suffixe}`;
const emailAdminA = `admin-a-${suffixe}@vertexone.test`;
const emailAdminInactifA = `inactif-a-${suffixe}@vertexone.test`;
const emailEmployeA = `employe-a-${suffixe}@vertexone.test`;
const emailAdminB = `admin-b-${suffixe}@vertexone.test`;
let idA = "", idB = "", adminA = "", adminB = "";
let compteur = 0;

async function nouvelleFacture(entrepriseId: string, adminId: string, nomClient = "Linda Mballa"): Promise<string> {
  compteur += 1;
  return avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: nomClient, telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-NP-${suffixe}-${compteur}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
      .returning({ id: facture.id });
    return f.id;
  });
}
async function nouvelleTentative(entrepriseId: string, factureId: string, montant: number, payToken: string) {
  const [t] = await avecEntreprise(entrepriseId, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId, factureId, montant, payToken }).returning({ id: tentativePaiementFacture.id }));
  return t.id;
}
const accepte = (id: string, montant: number, operateur = "MTN_Cameroon"): ResultatVerification => ({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${id}`, montant, operateur });
const destinataires = () => envoyerEmail.mock.calls.map((c) => c[0].to).sort();

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  const crees = await db
    .insert(utilisateur)
    .values([
      { entrepriseId: idA, email: emailAdminA, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" },
      { entrepriseId: idA, email: emailAdminInactifA, nomComplet: "Ancien Admin A", role: "ADMIN", statut: "DESACTIVE" },
      { entrepriseId: idA, email: emailEmployeA, nomComplet: "Employe A", role: "EMPLOYE", statut: "ACTIF" },
      { entrepriseId: idB, email: emailAdminB, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" },
    ])
    .returning({ id: utilisateur.id, email: utilisateur.email });
  adminA = crees.find((u) => u.email === emailAdminA)!.id;
  adminB = crees.find((u) => u.email === emailAdminB)!.id;
}, 180_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomA);
  await supprimerEntrepriseDeTest(nomB);
}, 180_000);

beforeEach(() => {
  verifierTransaction.mockReset();
  envoyerEmail.mockReset();
  envoyerEmail.mockResolvedValue({ envoye: true });
});

describe("Notification de paiement à l'Administrateur du compte", () => {
  test("une tranche confirmée prévient l'Administrateur actif de CE compte, avec le montant et le reste à payer", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, f, 5000, "MP26.8101.N81011");
    verifierTransaction.mockResolvedValue(accepte(id, 5000));
    expect(await relireEtConfirmerFacture(id)).toBe("CONFIRME");

    // Seul l'Administrateur actif de A : ni l'ancien administrateur désactivé, ni l'employé, ni l'administrateur de B.
    expect(destinataires()).toEqual([emailAdminA]);
    const mail = envoyerEmail.mock.calls[0][0];
    expect(mail.subject).toMatch(/tranche/);
    expect(mail.html).toContain("Linda Mballa");
    expect(mail.html).toMatch(/5[\s  ]000/);
    expect(mail.html).toMatch(/6[\s  ]925/); // le reste à payer
    expect(mail.html).toContain("Mobile Money (MTN)");
    expect(mail.html).toMatch(new RegExp(`/app/facturation/factures/${f}`));
  }, 240_000);

  test("le paiement qui solde la facture le dit", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, f, 11925, "MP26.8102.N81022");
    verifierTransaction.mockResolvedValue(accepte(id, 11925, "Orange_Cameroon"));
    await relireEtConfirmerFacture(id);
    const mail = envoyerEmail.mock.calls[0][0];
    expect(mail.subject).toMatch(/soldée/);
    expect(mail.html).toContain("entièrement réglée");
    expect(mail.html).toContain("Mobile Money (Orange)");
  }, 240_000);

  test("un même paiement n'est notifié qu'une fois, même relu ou renotifié par le prestataire", async () => {
    const f = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, f, 4000, "MP26.8103.N81033");
    verifierTransaction.mockResolvedValue(accepte(id, 4000));
    await relireEtConfirmerFacture(id);
    await relireEtConfirmerFacture(id);
    expect((await traiterNotificationPaiement({ payToken: "MP26.8103.N81033" })).code).toBe(200);
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    const reglements = await avecEntreprise(idA, (tx) => tx.select().from(paiement).where(eq(paiement.factureId, f)));
    expect(reglements).toHaveLength(1);
  }, 240_000);

  test("aucune notification pour un paiement refusé, pour un montant inattendu, ni pour une facture déjà réglée à la main", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refusee = await nouvelleFacture(idA, adminA);
    const idRefus = await nouvelleTentative(idA, refusee, 3000, "MP26.8104.N81044");
    verifierTransaction.mockResolvedValue({ statut: "REFUSED", indisponible: false, referenceExterne: `fac_${idRefus}`, montant: 3000, raisonEchec: "SOLDE_OU_COMPTE" });
    await relireEtConfirmerFacture(idRefus);

    const autreMontant = await nouvelleFacture(idA, adminA);
    const idMontant = await nouvelleTentative(idA, autreMontant, 3000, "MP26.8105.N81055");
    verifierTransaction.mockResolvedValue(accepte(idMontant, 999));
    await relireEtConfirmerFacture(idMontant);

    const reglee = await nouvelleFacture(idA, adminA);
    await avecEntreprise(idA, (tx) => tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, reglee)));
    const idReglee = await nouvelleTentative(idA, reglee, 3000, "MP26.8106.N81066");
    verifierTransaction.mockResolvedValue(accepte(idReglee, 3000));
    await relireEtConfirmerFacture(idReglee);

    expect(envoyerEmail).not.toHaveBeenCalled();
  }, 240_000);

  test("un compte n'est jamais prévenu du paiement d'un autre compte", async () => {
    const f = await nouvelleFacture(idB, adminB, "Client de B");
    const id = await nouvelleTentative(idB, f, 2000, "MP26.8107.N81077");
    verifierTransaction.mockResolvedValue(accepte(id, 2000));
    await relireEtConfirmerFacture(id);
    expect(destinataires()).toEqual([emailAdminB]);
    expect(envoyerEmail.mock.calls[0][0].html).toContain("Client de B");
  }, 240_000);

  test("le nom du client est échappé dans l'email", async () => {
    const f = await nouvelleFacture(idA, adminA, "<script>alert(1)</script> Eve");
    const id = await nouvelleTentative(idA, f, 2000, "MP26.8108.N81088");
    verifierTransaction.mockResolvedValue(accepte(id, 2000));
    await relireEtConfirmerFacture(id);
    const html = envoyerEmail.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  }, 240_000);

  test("un échec d'envoi n'empêche jamais l'enregistrement du paiement", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envoyerEmail.mockRejectedValue(new Error("panne Resend"));
    const f = await nouvelleFacture(idA, adminA);
    const id = await nouvelleTentative(idA, f, 11925, "MP26.8109.N81099");
    verifierTransaction.mockResolvedValue(accepte(id, 11925));
    expect(await relireEtConfirmerFacture(id)).toBe("CONFIRME");
    const [apres] = await avecEntreprise(idA, (tx) => tx.select().from(facture).where(eq(facture.id, f)));
    expect(apres.statut).toBe("PAYEE");
  }, 240_000);
});
