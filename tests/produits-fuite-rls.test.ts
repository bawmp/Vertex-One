import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour le
 * catalogue Produits/Tarifs (Items chez Zoho Books, échange du 2026-09-07)
 * — voir CLAUDE.md : "après chaque nouveau module touchant à des données
 * d'entreprise, un test délibéré doit vérifier qu'une entreprise fictive ne
 * peut techniquement pas accéder aux données d'une autre."
 */
describe("Produits — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let produitMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Produits Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Produits Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-produits-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-produits-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    await avecEntreprise(kiroId, (tx) => tx.insert(produit).values({ entrepriseId: kiroId, nom: "Produit Kiro" }));

    const [pM] = await avecEntreprise(mbargaId, (tx) =>
      tx.insert(produit).values({ entrepriseId: mbargaId, nom: "Produit Mbarga" }).returning({ id: produit.id })
    );
    produitMbargaId = pM.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, (tx) => tx.delete(produit).where(eq(produit.entrepriseId, id)));
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas les produits d'une autre, même en lecture large", async () => {
    const vusParKiro = await avecEntreprise(kiroId, (tx) => tx.select().from(produit));
    expect(vusParKiro.some((p) => p.id === produitMbargaId)).toBe(false);
  });

  test("une entreprise ne peut pas lire, modifier ni supprimer le produit d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(produit).where(eq(produit.id, produitMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(produit).set({ nom: "Piraté depuis Kiro" }).where(eq(produit.id, produitMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(produit).where(eq(produit.id, produitMbargaId)));
    expect(reel.nom).not.toBe("Piraté depuis Kiro");

    await avecEntreprise(kiroId, (tx) => tx.delete(produit).where(eq(produit.id, produitMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(produit).where(eq(produit.id, produitMbargaId)));
    expect(toujoursLa).toBeDefined();
  });
});
