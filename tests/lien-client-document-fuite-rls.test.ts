import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, devis, lienClientDocument } from "@/db/schema";
import { obtenirOuCreerLien, trouverLien } from "@/lib/client-documents/liens";

/**
 * Test de fuite délibérée entre deux entreprises fictives — voir CLAUDE.md. Le lien public
 * d'un devis est la seule table qui accepte une lecture SANS session (par jeton) : on vérifie
 * que cette lecture ne révèle qu'un identifiant, que l'écriture reste strictement cloisonnée
 * et qu'un jeton mal formé ne donne rien.
 */
describe("Liens clients (devis/factures) — isolation RLS", () => {
  let kiroId: string;
  let mbargaId: string;
  let devisMbargaId: string;
  let jetonMbarga: string;
  const suffixe = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Lien Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Lien Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uMbarga] = await db.insert(utilisateur).values({ entrepriseId: mbargaId, email: `admin-lien-${suffixe}@vertexone.test`, nomComplet: "Admin Mbarga", role: "ADMIN" }).returning({ id: utilisateur.id });

    await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId: mbargaId, nom: "Client Mbarga", telephone: "699000000", assigneAId: uMbarga.id }).returning({ id: contact.id });
      const [d] = await tx
        .insert(devis)
        .values({
          entrepriseId: mbargaId,
          numero: `DEV-TEST-${suffixe}`,
          contactId: c.id,
          assigneAId: uMbarga.id,
          dateValidite: new Date(Date.now() + 86_400_000),
          montantHT: 1000,
          montantTVA: 192,
          montantTTC: 1192,
          creeParId: uMbarga.id,
        })
        .returning({ id: devis.id });
      devisMbargaId = d.id;
      jetonMbarga = await obtenirOuCreerLien(tx, mbargaId, { devisId: d.id });
    });
  }, 60_000);

  afterAll(async () => {
    await avecEntreprise(mbargaId, async (tx) => {
      await tx.delete(lienClientDocument).where(eq(lienClientDocument.entrepriseId, mbargaId));
      await tx.delete(devis).where(eq(devis.entrepriseId, mbargaId));
      await tx.delete(contact).where(eq(contact.entrepriseId, mbargaId));
    });
    for (const id of [kiroId, mbargaId]) {
      await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, id));
      await db.delete(entreprise).where(eq(entreprise.id, id));
    }
  }, 60_000);

  test("obtenirOuCreerLien réutilise le même jeton pour un même devis", async () => {
    const encore = await avecEntreprise(mbargaId, (tx) => obtenirOuCreerLien(tx, mbargaId, { devisId: devisMbargaId }));
    expect(encore).toBe(jetonMbarga);
    expect(jetonMbarga).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  test("le jeton retrouve l'entreprise et le devis sans aucune session", async () => {
    const lien = await trouverLien(jetonMbarga);
    expect(lien).toEqual({ entrepriseId: mbargaId, devisId: devisMbargaId, factureId: null });
  });

  test("un jeton inconnu ou mal formé ne renvoie rien", async () => {
    expect(await trouverLien("x".repeat(32))).toBeNull();
    expect(await trouverLien("court")).toBeNull();
    expect(await trouverLien("' OR '1'='1")).toBeNull();
  });

  test("une autre entreprise, avec session, ne voit pas le lien de Mbarga", async () => {
    const vus = await avecEntreprise(kiroId, (tx) => tx.select().from(lienClientDocument).where(eq(lienClientDocument.jeton, jetonMbarga)));
    expect(vus).toHaveLength(0);
  });

  test("une autre entreprise ne peut ni créer un lien pour le devis de Mbarga, ni modifier ou supprimer le sien", async () => {
    await expect(
      avecEntreprise(kiroId, (tx) => tx.insert(lienClientDocument).values({ entrepriseId: mbargaId, devisId: devisMbargaId, jeton: `intrus${suffixe}`.padEnd(32, "x") }))
    ).rejects.toThrow();

    const modifies = await avecEntreprise(kiroId, (tx) => tx.update(lienClientDocument).set({ jeton: "pirate".padEnd(32, "x") }).where(eq(lienClientDocument.id, "n-importe")).returning());
    expect(modifies).toHaveLength(0);

    const supprimes = await avecEntreprise(kiroId, (tx) => tx.delete(lienClientDocument).where(eq(lienClientDocument.jeton, jetonMbarga)).returning());
    expect(supprimes).toHaveLength(0);
    expect(await trouverLien(jetonMbarga)).not.toBeNull();
  });

  test("les données du devis restent illisibles sans session : la lecture anonyme ne concerne que le lien", async () => {
    const anonyme = await db.select().from(devis).where(eq(devis.id, devisMbargaId));
    expect(anonyme).toHaveLength(0);
  });
});
