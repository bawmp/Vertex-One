import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { contact, entreprise, facture, tentativePaiementAbonnement, utilisateur } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

// « server-only » interdit l'import hors d'un composant serveur : sans effet pour un test Node.
vi.mock("server-only", () => ({}));

const { recupererAcquisition } = await import("@/lib/plateforme/acquisition");
const { essaisARelancer, synthese } = await import("@/lib/acquisition/stats");

const suffixe = Math.random().toString(36).slice(2, 8);
const nomPayante = `TEST Acq Payante ${suffixe}`;
const nomEssai = `TEST Acq Essai ${suffixe}`;
let idPayante: string;
let idEssai: string;

beforeAll(async () => {
  const [a] = await db
    .insert(entreprise)
    .values({ nom: nomPayante, secteurProfil: "immigration", origineSource: "facebook", origineSupport: "pub", origineCampagne: "mobilite-nov", origineParrain: null })
    .returning({ id: entreprise.id });
  const [b] = await db.insert(entreprise).values({ nom: nomEssai, secteurProfil: "agence", origineSource: "parrainage", origineParrain: "cabinet-test" }).returning({ id: entreprise.id });
  idPayante = a.id;
  idEssai = b.id;
  const [uA] = await db.insert(utilisateur).values({ entrepriseId: idPayante, email: `acq-a-${suffixe}@vertexone.test`, nomComplet: "Admin Payante", role: "ADMIN" }).returning({ id: utilisateur.id });
  await db.insert(utilisateur).values({ entrepriseId: idEssai, email: `acq-b-${suffixe}@vertexone.test`, nomComplet: "Admin Essai", role: "ADMIN" });
  // L'entreprise payante a un contact, une facture et un paiement d'abonnement annuel confirmé.
  await avecEntreprise(idPayante, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId: idPayante, nom: "Client", telephone: "+237600000000", assigneAId: uA.id }).returning({ id: contact.id });
    await tx.insert(facture).values({ entrepriseId: idPayante, numero: `FAC-ACQ-${suffixe}`, contactId: c.id, assigneAId: uA.id, dateEcheance: new Date(Date.now() + 30 * 86_400_000), montantHT: 10000, montantTVA: 1925, montantTTC: 11925 });
    await tx.insert(tentativePaiementAbonnement).values({ entrepriseId: idPayante, montant: 250000, mois: 12, statut: "CONFIRME", confirmeLe: new Date() });
  });
  await db.update(entreprise).set({ abonnementEcheanceLe: new Date(Date.now() + 360 * 86_400_000) }).where(eq(entreprise.id, idPayante));
}, 300_000);

afterAll(async () => {
  await supprimerEntrepriseDeTest(nomPayante);
  await supprimerEntrepriseDeTest(nomEssai);
}, 300_000);

describe("Acquisition — lecture réelle par la console interne", () => {
  test("lit l'origine, l'activation et le paiement de chaque entreprise ; les entreprises de test sont exclues par défaut", async () => {
    const parDefaut = await recupererAcquisition();
    expect(parDefaut.some((l) => l.nom.startsWith("TEST "))).toBe(false);

    const lignes = (await recupererAcquisition({ inclureTests: true })).filter((l) => l.nom.endsWith(suffixe));
    expect(lignes).toHaveLength(2);
    const payante = lignes.find((l) => l.nom === nomPayante)!;
    const essai = lignes.find((l) => l.nom === nomEssai)!;

    expect(payante).toMatchObject({ secteur: "immigration", origineSource: "facebook", origineCampagne: "mobilite-nov", adminEmail: `acq-a-${suffixe}@vertexone.test`, nbContacts: 1, nbFactures: 1, payant: true, dernierMontant: 250000, dernierMois: 12 });
    expect(payante.premiereFactureLe).toBeInstanceOf(Date);
    expect(essai).toMatchObject({ origineSource: "parrainage", origineParrain: "cabinet-test", nbContacts: 0, nbFactures: 0, payant: false, dernierMontant: null });
  }, 180_000);

  test("les indicateurs calculés sur ces lignes réelles : un payant à 250 000 FCFA/an = 20 833 FCFA par mois, l'essai neuf est à relancer", async () => {
    const lignes = (await recupererAcquisition({ inclureTests: true })).filter((l) => l.nom.endsWith(suffixe));
    const s = synthese(lignes, new Date());
    expect(s).toMatchObject({ total: 2, payants: 1, essaisEnCours: 1, mrr: Math.round(250000 / 12) });
    const relances = essaisARelancer(lignes, new Date());
    expect(relances.map((r) => r.nom)).toEqual([nomEssai]); // la payante n'est jamais listée
  }, 180_000);
});
