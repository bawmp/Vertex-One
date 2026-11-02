import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, produit } from "@/db/schema";
import { definirSeuilAlerte } from "@/lib/produits/stock";
import { aReapprovisionner, niveauStock } from "@/lib/produits/niveau-stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const base = { type: "BIEN", suiviStock: true, stockActuel: 10, seuilAlerte: null as number | null };

describe("Stock — niveau d'un produit (règle pure)", () => {
  test("rupture à zéro ou moins, même sans seuil", () => {
    expect(niveauStock({ ...base, stockActuel: 0 })).toBe("RUPTURE");
    expect(niveauStock({ ...base, stockActuel: -2, seuilAlerte: 5 })).toBe("RUPTURE");
  });
  test("stock bas quand on atteint le seuil ou en dessous, jamais sans seuil", () => {
    expect(niveauStock({ ...base, stockActuel: 5, seuilAlerte: 5 })).toBe("BAS");
    expect(niveauStock({ ...base, stockActuel: 3, seuilAlerte: 5 })).toBe("BAS");
    expect(niveauStock({ ...base, stockActuel: 6, seuilAlerte: 5 })).toBe("OK");
    expect(niveauStock({ ...base, stockActuel: 1, seuilAlerte: null })).toBe("OK");
    expect(niveauStock({ ...base, stockActuel: 1, seuilAlerte: 0 })).toBe("OK");
  });
  test("un service ou un produit non suivi n'a aucun niveau", () => {
    expect(niveauStock({ ...base, type: "SERVICE", stockActuel: 0 })).toBeNull();
    expect(niveauStock({ ...base, suiviStock: false, stockActuel: 0 })).toBeNull();
    expect(aReapprovisionner({ ...base, suiviStock: false, stockActuel: 0 })).toBe(false);
    expect(aReapprovisionner({ ...base, stockActuel: 0 })).toBe(true);
  });
});

describe("Stock — seuil d'alerte (base réelle)", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Stock Alerte A ${suffixe}`;
  const nomB = `TEST Stock Alerte B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;
  let utilisateurA: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: entrepriseA, email: `alerte-a-${suffixe}@vertexone.test`, nomComplet: "Admin Alerte A", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurA = ua.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const nouveau = async (valeurs: Partial<typeof produit.$inferInsert> = {}) => {
    const [p] = await avecEntreprise(entrepriseA, (tx) =>
      tx.insert(produit).values({ entrepriseId: entrepriseA, type: "BIEN", nom: "Article alerte", suiviStock: true, stockActuel: 10, creeParId: utilisateurA, ...valeurs }).returning({ id: produit.id })
    );
    return p.id;
  };
  const seuil = async (id: string) => (await avecEntreprise(entrepriseA, (tx) => tx.select({ s: produit.seuilAlerte }).from(produit).where(eq(produit.id, id))))[0].s;

  test("fixer, modifier puis retirer le seuil ; valeurs invalides refusées", async () => {
    const id = await nouveau();
    expect(await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, id, 4))).toEqual({ ok: true, seuil: 4 });
    expect(await seuil(id)).toBe(4);
    expect(await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, id, 0))).toEqual({ ok: true, seuil: 0 });
    expect(await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, id, null))).toEqual({ ok: true, seuil: null });
    expect(await seuil(id)).toBeNull();

    for (const mauvais of [-1, 2.5, Number.NaN, 2_000_000]) {
      expect((await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, id, mauvais))).ok).toBe(false);
    }
    expect(await seuil(id)).toBeNull();
  });

  test("refusé pour un produit non suivi ou un service", async () => {
    const nonSuivi = await nouveau({ suiviStock: false, stockActuel: 0 });
    const service = await nouveau({ type: "SERVICE", suiviStock: false, stockActuel: 0 });
    expect((await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, nonSuivi, 3))).ok).toBe(false);
    expect((await avecEntreprise(entrepriseA, (tx) => definirSeuilAlerte(tx, entrepriseA, service, 3))).ok).toBe(false);
  });

  test("fuite entre entreprises : B ne peut pas fixer le seuil d'un produit de A", async () => {
    const id = await nouveau();
    const tentative = await avecEntreprise(entrepriseB, (tx) => definirSeuilAlerte(tx, entrepriseB, id, 99));
    expect(tentative.ok).toBe(false);
    expect(await seuil(id)).toBeNull();
  });
});
