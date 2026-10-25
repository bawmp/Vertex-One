import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { inflateSync } from "node:zlib";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, tentativePaiementFacture, emailEnvoye } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";
import type { ResultatVerification } from "@/lib/paiement/types";

vi.mock("server-only", () => ({}));
// L'envoi part « après la réponse » : on garde les tâches pour pouvoir attendre leur fin avant de vérifier.
const taches = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => { taches.push(Promise.resolve().then(f)); } }));
// Pas de stockage d'objets en test : le logo est « disponible » pour l'email (champs en base) mais le PDF ne le charge pas.
vi.mock("@/lib/pdf/logo", async (original) => ({ ...(await original<typeof import("@/lib/pdf/logo")>()), logoPourPDF: async () => null }));

type Courrier = { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[]; nomExpediteur?: string };
const envoyerEmail = vi.fn<(p: Courrier) => Promise<{ envoye: boolean; erreur?: string }>>();
vi.mock("@/lib/email/client", () => ({ envoyerEmail: (p: Courrier) => envoyerEmail(p) }));

const verifierTransaction = vi.fn<(payToken: string) => Promise<ResultatVerification>>();
vi.mock("@/lib/aangaraa/client", async () => {
  const { moyenPaiementDepuisOperateur } = await import("@/lib/aangaraa/utilitaires");
  return { verifierTransaction: (t: string) => verifierTransaction(t), moyenPaiementDepuisOperateur };
});

const { relireEtConfirmerFacture } = await import("@/lib/paiement/confirmation");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomA = `TEST RecuClient A ${suffixe}`;
const nomB = `TEST RecuClient B ${suffixe}`;
const emailAdminA = `admin-a-${suffixe}@vertexone.test`;
const emailClient = `client-${suffixe}@exemple.test`;
let idA = "", idB = "", adminA = "", adminB = "";
let compteur = 0;

async function nouvelleFacture(entrepriseId: string, adminId: string, emailDuClient: string | null, nomClient = "Linda Mballa") {
  compteur += 1;
  return avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: nomClient, email: emailDuClient, telephone: "+237600000000", assigneAId: adminId }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-RC-${suffixe}-${compteur}`, contactId: c.id, assigneAId: adminId, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 })
      .returning({ id: facture.id, numero: facture.numero });
    return { id: f.id, numero: f.numero, contactId: c.id };
  });
}
async function payer(entrepriseId: string, factureId: string, montant: number, payToken: string, operateur = "MTN_Cameroon") {
  const [t] = await avecEntreprise(entrepriseId, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId, factureId, montant, payToken }).returning({ id: tentativePaiementFacture.id }));
  verifierTransaction.mockResolvedValueOnce({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${t.id}`, montant, operateur });
  const statut = await relireEtConfirmerFacture(t.id);
  await Promise.all(taches.splice(0)); // les emails envoyés après la réponse sont partis
  return statut;
}
const courriers = (a: string) => envoyerEmail.mock.calls.map((c) => c[0]).filter((c) => c.to === a);

/** Texte d'un PDF react-pdf (polices standard) : les chaînes sont des suites hexadécimales dans des flux compressés. */
function texteDuPDF(pdf: Buffer): string {
  let texte = "";
  for (const m of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const flux = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      for (const h of flux.matchAll(/<([0-9a-fA-F]+)>/g)) texte += Buffer.from(h[1], "hex").toString("latin1");
      texte += "\n";
    } catch {
      // flux non compressé ou binaire : ignoré
    }
  }
  return texte;
}

beforeAll(async () => {
  const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence", logoCleStockage: "logo-test", logoTypeMime: "image/png" }).returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
  idA = a.id;
  idB = b.id;
  [{ id: adminA }] = await db.insert(utilisateur).values({ entrepriseId: idA, email: emailAdminA, nomComplet: "Admin A", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
  [{ id: adminB }] = await db.insert(utilisateur).values({ entrepriseId: idB, email: `admin-b-${suffixe}@vertexone.test`, nomComplet: "Admin B", role: "ADMIN", statut: "ACTIF" }).returning({ id: utilisateur.id });
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

describe("Reçu envoyé au client après chaque paiement", () => {
  test("une tranche : email au nom de l'entreprise, logo en tête, facture à jour en pièce jointe avec « Déjà réglé » et « Reste à payer »", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient);
    expect(await payer(idA, f.id, 5000, "MP26.9101.C91011")).toBe("CONFIRME");

    const recus = courriers(emailClient);
    expect(recus).toHaveLength(1);
    const mail = recus[0];
    expect(mail.nomExpediteur).toBe(nomA); // au nom de l'entreprise
    expect(mail.subject).toMatch(/Reçu de paiement/);
    expect(mail.html).toContain(`/logo/${idA}`); // logo de l'entreprise en tête
    expect(mail.html).toContain("Linda Mballa");
    expect(mail.html).toMatch(/Il vous reste/);
    expect(mail.html).toMatch(/\/facture\/[A-Za-z0-9]{32}/); // lien privé de la facture
    expect(mail.html).toContain(nomA); // signature

    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments![0].filename).toBe(`${f.numero}.pdf`);
    const pdf = mail.attachments![0].content;
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const texte = texteDuPDF(pdf);
    expect(texte).toContain("Déjà réglé");
    expect(texte).toContain("Reste à payer");
    expect(texte).toMatch(/5 000/);
    expect(texte).toMatch(/6 925/);

    // Conservé dans l'historique du contact (comme les autres emails envoyés).
    const journal = await avecEntreprise(idA, (tx) => tx.select().from(emailEnvoye).where(eq(emailEnvoye.contactId, f.contactId)));
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ destinataire: emailClient, type: "FACTURE" });
  }, 240_000);

  test("la dernière tranche : facture « entièrement réglée », avec le PDF acquitté", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient);
    await payer(idA, f.id, 5000, "MP26.9102.C91022");
    envoyerEmail.mockClear();
    await payer(idA, f.id, 6925, "MP26.9103.C91033", "Orange_Cameroon");
    const mail = courriers(emailClient)[0];
    expect(mail.subject).toMatch(/réglée/);
    expect(mail.html).toContain("entièrement réglée");
    expect(mail.html).toContain("Mobile Money (Orange)");
    const texte = texteDuPDF(mail.attachments![0].content);
    expect(texte).toMatch(/Reste à payer/);
    expect(texte).toMatch(/11 925/);
  }, 240_000);

  test("un paiement complet en une fois envoie aussi le reçu", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient);
    await payer(idA, f.id, 11925, "MP26.9104.C91044");
    expect(courriers(emailClient)).toHaveLength(1);
    expect(courriers(emailClient)[0].subject).toMatch(/réglée/);
  }, 240_000);

  test("un même paiement n'envoie qu'un seul reçu, même relu plusieurs fois", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient);
    const [t] = await avecEntreprise(idA, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId: idA, factureId: f.id, montant: 3000, payToken: "MP26.9105.C91055" }).returning({ id: tentativePaiementFacture.id }));
    verifierTransaction.mockResolvedValue({ statut: "ACCEPTED", indisponible: false, referenceExterne: `fac_${t.id}`, montant: 3000, operateur: "MTN_Cameroon" });
    await relireEtConfirmerFacture(t.id);
    await relireEtConfirmerFacture(t.id);
    await relireEtConfirmerFacture(t.id);
    await Promise.all(taches.splice(0));
    expect(courriers(emailClient)).toHaveLength(1);
  }, 240_000);

  test("client sans email : aucun reçu, et l'Administrateur en est prévenu", async () => {
    const f = await nouvelleFacture(idA, adminA, null);
    await payer(idA, f.id, 4000, "MP26.9106.C91066");
    const admin = courriers(emailAdminA);
    expect(admin).toHaveLength(1);
    expect(admin[0].html).toContain("aucun reçu ne lui a été envoyé");
    expect(envoyerEmail.mock.calls.map((c) => c[0].to)).toEqual([emailAdminA]); // personne d'autre
  }, 240_000);

  test("client avec email : l'Administrateur sait que le reçu est parti", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient);
    await payer(idA, f.id, 4000, "MP26.9107.C91077");
    expect(courriers(emailAdminA)[0].html).toContain("Un reçu avec la facture à jour a été envoyé au client");
  }, 240_000);

  test("un compte n'envoie jamais le reçu avec les données d'un autre compte", async () => {
    const fB = await nouvelleFacture(idB, adminB, `client-b-${suffixe}@exemple.test`, "Client de B");
    await payer(idB, fB.id, 2000, "MP26.9108.C91088");
    const recus = courriers(`client-b-${suffixe}@exemple.test`);
    expect(recus).toHaveLength(1);
    expect(recus[0].nomExpediteur).toBe(nomB);
    expect(recus[0].html).toContain("Client de B");
    expect(recus[0].html).not.toContain(`/logo/${idA}`);
    expect(courriers(emailClient)).toHaveLength(0);
  }, 240_000);

  test("le nom du client est échappé dans l'email", async () => {
    const f = await nouvelleFacture(idA, adminA, emailClient, "<script>x</script> Eve");
    await payer(idA, f.id, 2000, "MP26.9109.C91099");
    const mail = courriers(emailClient)[0];
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  }, 240_000);

  test("un échec d'envoi du reçu n'empêche jamais l'enregistrement du paiement ni l'email à l'Administrateur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envoyerEmail.mockImplementation(async (p) => {
      if (p.to === emailClient) throw new Error("panne Resend");
      return { envoye: true };
    });
    const f = await nouvelleFacture(idA, adminA, emailClient);
    expect(await payer(idA, f.id, 11925, "MP26.9110.C91100")).toBe("CONFIRME");
    const [apres] = await avecEntreprise(idA, (tx) => tx.select().from(facture).where(eq(facture.id, f.id)));
    expect(apres.statut).toBe("PAYEE");
    expect(courriers(emailAdminA)).toHaveLength(1);
  }, 240_000);
});
