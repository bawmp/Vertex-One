import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, annonce, pieceJointeAnnonce } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives (voir CLAUDE.md) pour la nouvelle table des pièces jointes
 * d'annonces : chacune ne voit, ne modifie et ne supprime que les siennes, et rien n'est lisible sans session.
 */
describe("Annonces — pièces jointes : isolation RLS", () => {
  let kiroId: string;
  let mbargaId: string;
  let pieceMbargaId: string;
  let annonceMbargaId: string;
  const suffixe = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Annonce Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Annonce Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;
    const [uMbarga] = await db.insert(utilisateur).values({ entrepriseId: mbargaId, email: `admin-annonce-${suffixe}@vertexone.test`, nomComplet: "Admin Mbarga", role: "ADMIN" }).returning({ id: utilisateur.id });

    await avecEntreprise(mbargaId, async (tx) => {
      const [a] = await tx.insert(annonce).values({ entrepriseId: mbargaId, auteurId: uMbarga.id, contenu: "Annonce confidentielle Mbarga" }).returning({ id: annonce.id });
      annonceMbargaId = a.id;
      const [p] = await tx
        .insert(pieceJointeAnnonce)
        .values({ entrepriseId: mbargaId, annonceId: a.id, cleStockage: `${mbargaId}/annonces/secret.pdf`, nom: "secret.pdf", typeMime: "application/pdf", tailleOctets: 100 })
        .returning({ id: pieceJointeAnnonce.id });
      pieceMbargaId = p.id;
    });
  }, 90_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, async (tx) => {
      await tx.delete(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.entrepriseId, mbargaId));
      await tx.delete(annonce).where(eq(annonce.entrepriseId, mbargaId));
    });
    for (const id of [kiroId, mbargaId]) {
      await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, id));
      await db.delete(entreprise).where(eq(entreprise.id, id));
    }
  }, 90_000);

  test("une autre entreprise ne voit pas la pièce jointe de Mbarga, même en connaissant son identifiant", async () => {
    expect(await avecEntreprise(kiroId, (tx) => tx.select().from(pieceJointeAnnonce))).toHaveLength(0);
    expect(await avecEntreprise(kiroId, (tx) => tx.select().from(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.id, pieceMbargaId)))).toHaveLength(0);
    expect(await avecEntreprise(mbargaId, (tx) => tx.select().from(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.id, pieceMbargaId)))).toHaveLength(1);
  }, 90_000);

  test("sans session, aucune pièce jointe n'est lisible", async () => {
    expect(await db.select().from(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.id, pieceMbargaId))).toHaveLength(0);
  }, 90_000);

  test("une autre entreprise ne peut ni rattacher une pièce à l'annonce de Mbarga, ni modifier ou supprimer la sienne", async () => {
    await expect(
      avecEntreprise(kiroId, (tx) => tx.insert(pieceJointeAnnonce).values({ entrepriseId: mbargaId, annonceId: annonceMbargaId, cleStockage: "x", nom: "intrus.pdf", typeMime: "application/pdf", tailleOctets: 1 }))
    ).rejects.toThrow();
    const modifiees = await avecEntreprise(kiroId, (tx) => tx.update(pieceJointeAnnonce).set({ nom: "piraté.pdf" }).where(eq(pieceJointeAnnonce.id, pieceMbargaId)).returning());
    expect(modifiees).toHaveLength(0);
    const supprimees = await avecEntreprise(kiroId, (tx) => tx.delete(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.id, pieceMbargaId)).returning());
    expect(supprimees).toHaveLength(0);
    const [encore] = await avecEntreprise(mbargaId, (tx) => tx.select().from(pieceJointeAnnonce).where(eq(pieceJointeAnnonce.id, pieceMbargaId)));
    expect(encore.nom).toBe("secret.pdf");
  }, 90_000);
});
