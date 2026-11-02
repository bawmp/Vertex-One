import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, produit, utilisateur } from "@/db/schema";
import { chiffreControleEan13, decoderModulesEan13, ean13Valide, genererEan13Interne, modulesEan13, normaliserCode, svgEan13 } from "@/lib/produits/codes-barres-regles";
import { definirCodeBarres, genererCodeBarres, trouverParCode } from "@/lib/produits/codes-barres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 3.6 : codes-barres (douchette ou caméra), EAN-13 interne et étiquette. */
describe("Codes-barres — règles pures", () => {
  test("normalisation : espaces et retours de lecteur retirés, caractères et longueur contrôlés", () => {
    expect(normaliserCode(" 6001234567890\r\n")).toBe("6001234567890");
    expect(normaliserCode("AB 12")).toBe("AB12");
    expect(normaliserCode("A-1_2.3/4")).toBe("A-1_2.3/4");
    expect(normaliserCode("ab")).toBeNull();
    expect(normaliserCode("x".repeat(49))).toBeNull();
    expect(normaliserCode("<script>")).toBeNull();
    expect(normaliserCode("é1234")).toBeNull();
    expect(normaliserCode("")).toBeNull();
  });

  test("EAN-13 : chiffre de contrôle et validation sur des codes réels", () => {
    expect(chiffreControleEan13("400638133393")).toBe(1);
    expect(ean13Valide("4006381333931")).toBe(true);
    expect(ean13Valide("4006381333932")).toBe(false);
    expect(ean13Valide("400638133393")).toBe(false);
    expect(ean13Valide("40063813339A1")).toBe(false);
    expect(ean13Valide("5901234123457")).toBe(true);
  });

  test("code interne généré : préfixe 200, 13 chiffres, contrôle valide, jamais deux fois le même sur 200 tirages", () => {
    const codes = new Set(Array.from({ length: 200 }, () => genererEan13Interne()));
    expect(codes.size).toBeGreaterThan(190);
    for (const c of codes) {
      expect(c).toMatch(/^200\d{10}$/);
      expect(ean13Valide(c)).toBe(true);
    }
    let i = 0;
    expect(genererEan13Interne(() => i++)).toBe(`200012345678${chiffreControleEan13("200012345678")}`);
  });

  test("dessin : 95 modules, gardes, et le code se relit à l'identique", () => {
    for (const code of ["4006381333931", "5901234123457", "2000123456781".slice(0, 12) + chiffreControleEan13("200012345678")]) {
      const bits = modulesEan13(code)!;
      expect(bits).toHaveLength(95);
      expect(bits.startsWith("101") && bits.endsWith("101") && bits.slice(45, 50) === "01010").toBe(true);
      expect(decoderModulesEan13(bits)).toBe(code);
    }
    expect(modulesEan13("4006381333932")).toBeNull();
    expect(decoderModulesEan13("1".repeat(95))).toBeNull();
  });

  test("SVG : balisé, accessible, refusé pour un code qui n'est pas un EAN-13", () => {
    const svg = svgEan13("4006381333931")!;
    expect(svg).toContain("<svg");
    expect(svg).toContain('aria-label="4006381333931"');
    expect(svg).toContain("4 006381 333931");
    expect(svgEan13("ABC-123")).toBeNull();
  });
});

describe("Codes-barres — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST CodeBarres A ${suffixe}`;
  const nomB = `TEST CodeBarres B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: A, email: `cb-a-${suffixe}@vertexone.test`, nomComplet: "Admin CB A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = x.id;
    await avecEntreprise(A, async (tx) => {
      const p = async (nom: string, valeurs: Partial<typeof produit.$inferInsert> = {}) => (await tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, stockActuel: 7, prixVente: 2500, creeParId: uA, ...valeurs }).returning({ id: produit.id }))[0].id;
      ids.a = await p("Savon");
      ids.b = await p("Huile");
      ids.service = await p("Coupe", { type: "SERVICE", suiviStock: false });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const fixer = (pid: string, code: string | null, e = A) => avecEntreprise(e, (tx) => definirCodeBarres(tx, e, pid, code));

  test("fixer un code : nettoyé, retrouvé par la lecture (même avec espaces ou retour chariot), retirable", async () => {
    expect(await fixer(ids.a, " 6001234 567890 ")).toEqual({ ok: true, code: "6001234567890" });
    const t = await avecEntreprise(A, (tx) => trouverParCode(tx, A, "6001234567890\r\n"));
    expect(t).toMatchObject({ id: ids.a, nom: "Savon", stockActuel: 7, prixVente: 2500, codeBarres: "6001234567890" });
    expect(await avecEntreprise(A, (tx) => trouverParCode(tx, A, "0000000000"))).toBeNull();
    expect(await avecEntreprise(A, (tx) => trouverParCode(tx, A, "é"))).toBeNull();
    expect(await fixer(ids.a, "")).toEqual({ ok: true, code: null });
    expect(await avecEntreprise(A, (tx) => trouverParCode(tx, A, "6001234567890"))).toBeNull();
  }, 120_000);

  test("un code est unique dans l'entreprise ; le même produit peut le reconfirmer ; un service n'en reçoit pas", async () => {
    expect((await fixer(ids.a, "ABC-100")).ok).toBe(true);
    expect((await fixer(ids.a, "ABC-100")).ok).toBe(true); // même produit : accepté
    const doublon = await fixer(ids.b, "abc-100".toUpperCase());
    expect(doublon).toEqual({ ok: false, erreur: "Ce code est déjà utilisé par un autre produit." });
    expect((await fixer(ids.b, "ab")).ok).toBe(false); // trop court
    expect((await fixer(ids.service, "SERV-1")).ok).toBe(false);
    expect((await fixer("inconnu", "ZZZ-9")).ok).toBe(false);
  }, 120_000);

  test("générer un code : EAN-13 interne valide, unique, et on évite un code déjà pris", async () => {
    const r = await avecEntreprise(A, (tx) => genererCodeBarres(tx, A, ids.b));
    expect(r.ok).toBe(true);
    const code = r.ok ? r.code! : "";
    expect(ean13Valide(code)).toBe(true);
    expect(code.startsWith("200")).toBe(true);
    expect((await avecEntreprise(A, (tx) => tx.select({ c: produit.codeBarres }).from(produit).where(eq(produit.id, ids.b))))[0].c).toBe(code);

    // Tirage figé sur un code déjà pris : les 8 essais échouent proprement, sans écraser le produit.
    let k = 0;
    const figé = () => (k++ % 9 === 0 ? 0 : 0);
    const pris = genererEan13Interne(figé);
    await fixer(ids.a, pris);
    const refus = await avecEntreprise(A, (tx) => genererCodeBarres(tx, A, ids.b, () => 0));
    expect(refus.ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => tx.select({ c: produit.codeBarres }).from(produit).where(eq(produit.id, ids.b))))[0].c).toBe(code);
  }, 180_000);

  test("fuite entre entreprises : B ne retrouve pas le code de A, peut réutiliser le même, et ne peut pas toucher aux produits de A", async () => {
    const codeA = "ABC-200";
    expect((await fixer(ids.a, codeA)).ok).toBe(true);
    expect(await avecEntreprise(B, (tx) => trouverParCode(tx, B, codeA))).toBeNull();
    const [pB] = await avecEntreprise(B, (tx) => tx.insert(produit).values({ entrepriseId: B, type: "BIEN", nom: "Produit B", creeParId: uA }).returning({ id: produit.id }).catch(() => []));
    if (pB) {
      expect((await fixer(pB.id, codeA, B)).ok).toBe(true); // l'unicité est PAR entreprise
      expect(await avecEntreprise(A, (tx) => trouverParCode(tx, A, codeA))).toMatchObject({ id: ids.a });
    }
    expect((await fixer(ids.a, "PIRATE-1", B)).ok).toBe(false); // le produit de A reste introuvable depuis B
    expect((await avecEntreprise(A, (tx) => tx.select({ c: produit.codeBarres }).from(produit).where(eq(produit.id, ids.a))))[0].c).toBe(codeA);
  }, 180_000);
});
