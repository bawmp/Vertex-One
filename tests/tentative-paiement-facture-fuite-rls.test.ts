import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, facture, tentativePaiementFacture } from "@/db/schema";

/**
 * Paiement en ligne CinetPay (2026-09-14, migré vers cinetpay-js le
 * 2026-09-18) — test de fuite délibérée entre deux entreprises fictives,
 * voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre." Cette table a,
 * depuis la migration, un carve-out de lecture anonyme façon `invitation` —
 * l'API v1 de CinetPay impose merchantTransactionId ≤ 30 caractères,
 * incompatible avec l'ancien préfixage entrepriseId+id (voir le commentaire
 * sur tentativePaiementFacture dans src/db/schema.ts). Ce test vérifie donc
 * à la fois que la lecture anonyme fonctionne bien (par id exact) ET que
 * l'écriture anonyme reste, elle, strictement rejetée.
 */
describe("Tentative de paiement Facture — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let contactMbargaId: string;
  let factureMbargaId: string;
  let tentativeMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Tentative Paiement Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Tentative Paiement Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-tp-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-tp-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbarga.id;

    const resultat = await avecEntreprise(mbargaId, async (tx) => {
      const [leContact] = await tx
        .insert(contact)
        .values({ entrepriseId: mbargaId, nom: "Client Mbarga", telephone: "+237600000000", assigneAId: adminMbargaId })
        .returning({ id: contact.id });
      const [laFacture] = await tx
        .insert(facture)
        .values({
          entrepriseId: mbargaId,
          numero: "FAC-TEST-TP-0001",
          contactId: leContact.id,
          assigneAId: adminMbargaId,
          dateEcheance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          montantHT: 10000,
          montantTVA: 1925,
          montantTTC: 11925,
        })
        .returning({ id: facture.id });
      const [tentative] = await tx
        .insert(tentativePaiementFacture)
        .values({ entrepriseId: mbargaId, factureId: laFacture.id, montant: 11925 })
        .returning({ id: tentativePaiementFacture.id });
      return { contactId: leContact.id, factureId: laFacture.id, tentativeId: tentative.id };
    });
    contactMbargaId = resultat.contactId;
    factureMbargaId = resultat.factureId;
    tentativeMbargaId = resultat.tentativeId;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, async (tx) => {
      await tx.delete(tentativePaiementFacture).where(eq(tentativePaiementFacture.factureId, factureMbargaId));
      await tx.delete(facture).where(eq(facture.id, factureMbargaId));
      await tx.delete(contact).where(eq(contact.id, contactMbargaId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  });

  test("une entreprise ne voit jamais la tentative de paiement d'une autre", async () => {
    const depuisKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeMbargaId)));
    expect(depuisKiro).toHaveLength(0);
  });

  test("lecture anonyme par id exact réussit (nécessaire au webhook public, même patron que invitation)", async () => {
    const sansSession = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeMbargaId));
    expect(sansSession).toHaveLength(1);
    expect(sansSession[0].entrepriseId).toBe(mbargaId);
  });

  test("écriture anonyme rejetée — une mise à jour sans avecEntreprise() ne modifie jamais rien", async () => {
    const resultat = await db
      .update(tentativePaiementFacture)
      .set({ statut: "CONFIRME" })
      .where(eq(tentativePaiementFacture.id, tentativeMbargaId))
      .returning({ id: tentativePaiementFacture.id });
    expect(resultat).toHaveLength(0);

    const [tentativeInchangee] = await avecEntreprise(mbargaId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeMbargaId)));
    expect(tentativeInchangee.statut).toBe("EN_ATTENTE");
  });

  test("l'entreprise propriétaire voit bien sa propre tentative", async () => {
    const depuisMbarga = await avecEntreprise(mbargaId, (tx) => tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeMbargaId)));
    expect(depuisMbarga).toHaveLength(1);
    expect(depuisMbarga[0].statut).toBe("EN_ATTENTE");
  });
});
