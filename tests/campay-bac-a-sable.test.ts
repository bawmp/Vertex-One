import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, tentativePaiementFacture } from "@/db/schema";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

vi.mock("server-only", () => ({}));

/**
 * Appelle le VRAI bac à sable de CamPay (demo.campay.net, aucun argent réel) : ne tourne qu'avec des identifiants de bac à
 * sable dans l'environnement (CAMPAY_TOKEN ou CAMPAY_USERNAME + CAMPAY_PASSWORD, CAMPAY_ENV différent de « production »).
 * Le bac à sable plafonne chaque transaction à 25 FCFA : la facture de ces tests vaut 20 FCFA.
 */
const actif = Boolean(process.env.CAMPAY_TOKEN || (process.env.CAMPAY_USERNAME && process.env.CAMPAY_PASSWORD)) && process.env.CAMPAY_ENV !== "production";

const suffixe = Math.random().toString(36).slice(2, 8);
const nom = `TEST Campay Reel ${suffixe}`;
let entrepriseId: string;
let factureId: string;

beforeAll(async () => {
  if (!actif) return;
  const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence" }).returning({ id: entreprise.id });
  entrepriseId = e.id;
  const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `admin-reel-${suffixe}@vertexone.test`, nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
  factureId = await avecEntreprise(entrepriseId, async (tx) => {
    const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Client Réel", telephone: "+237600000000", assigneAId: u.id }).returning({ id: contact.id });
    const [f] = await tx
      .insert(facture)
      .values({ entrepriseId, numero: `FAC-REEL-${suffixe}`, contactId: c.id, assigneAId: u.id, dateEcheance: new Date(Date.now() + 86_400_000), montantHT: 17, montantTVA: 3, montantTTC: 20 })
      .returning({ id: facture.id });
    return f.id;
  });
}, 180_000);

afterAll(async () => {
  if (actif) await supprimerEntrepriseDeTest(nom);
}, 180_000);

describe.skipIf(!actif)("CamPay — bac à sable réel", () => {
  test("le lien de paiement d'une facture se crée pour de vrai et pointe vers la page de paiement CamPay", async () => {
    const { creerLienPaiementFacture } = await import("@/lib/facturation/paiement-en-ligne");
    const resultat = await avecEntreprise(entrepriseId, (tx) => creerLienPaiementFacture(tx, { entrepriseId, factureId, returnUrl: "https://vertexone.cm/facture/test" }));
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.url).toMatch(/^https:\/\/demo\.campay\.net\/pay\//);
    const tentatives = await avecEntreprise(entrepriseId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.factureId, factureId)));
    expect(tentatives).toHaveLength(1);
    expect(tentatives[0]).toMatchObject({ statut: "EN_ATTENTE", montant: 20 });
  }, 120_000);

  test("une vraie transaction est relue : sa référence externe retrouve la tentative, en attente elle ne change rien", async () => {
    const { verifierTransaction } = await import("@/lib/campay/client");
    const { referenceExterne, lireReferenceExterne } = await import("@/lib/campay/utilitaires");
    const { traiterNotificationCampay } = await import("@/lib/paiement/confirmation");

    const [tentative] = await avecEntreprise(entrepriseId, (tx) => tx.insert(tentativePaiementFacture).values({ entrepriseId, factureId, montant: 20 }).returning({ id: tentativePaiementFacture.id }));
    const jeton = process.env.CAMPAY_TOKEN;
    const cle = jeton
      ? `Token ${jeton}`
      : `Token ${((await (await fetch("https://demo.campay.net/api/token/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.CAMPAY_USERNAME, password: process.env.CAMPAY_PASSWORD }) })).json()) as { token: string }).token}`;
    const collecte = (await (
      await fetch("https://demo.campay.net/api/collect/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: cle },
        body: JSON.stringify({ amount: "5", currency: "XAF", from: "237670000000", description: "Test Vertex One", external_reference: referenceExterne("FACTURE", tentative.id) }),
      })
    ).json()) as { reference: string };

    const verification = await verifierTransaction(collecte.reference);
    expect(verification.indisponible).toBe(false);
    expect(verification.statut).toBe("PENDING");
    expect(verification.montant).toBe(5);
    expect(lireReferenceExterne(verification.referenceExterne)).toEqual({ nature: "FACTURE", id: tentative.id });

    // Notification pour cette transaction : reconnue (200), mais rien n'est confirmé tant que CamPay ne dit pas SUCCESSFUL.
    expect((await traiterNotificationCampay({ reference: collecte.reference, signature: null })).code).toBe(200);
    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentative.id)));
    expect(apres.statut).toBe("EN_ATTENTE");
  }, 120_000);

  test("une référence inconnue de CamPay est refusée proprement (404), sans rien écrire", async () => {
    const { traiterNotificationCampay } = await import("@/lib/paiement/confirmation");
    expect((await traiterNotificationCampay({ reference: "00000000-0000-0000-0000-000000000000", signature: null })).code).toBe(404);
  }, 60_000);
});
