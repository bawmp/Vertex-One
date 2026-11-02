import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, produit, utilisateur } from "@/db/schema";
import { doitAlerter, niveauApresVerification } from "@/lib/produits/niveau-stock";
import { traiterAlertesStock } from "@/lib/produits/alertes-stock";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

const envoyerEmail = vi.hoisted(() => vi.fn(async () => ({ envoye: true })));
vi.mock("@/lib/email/client", () => ({ envoyerEmail }));

/** Priorité 3.2 : alerte par email quand un produit passe en stock bas ou en rupture, une seule fois par niveau. */
describe("Alertes de stock — règles pures", () => {
  test("alerte au passage en stock bas ou en rupture, jamais deux fois le même niveau", () => {
    expect(doitAlerter(null, "BAS")).toBe(true);
    expect(doitAlerter("BAS", "BAS")).toBe(false);
    expect(doitAlerter(null, "RUPTURE")).toBe(true);
    expect(doitAlerter("BAS", "RUPTURE")).toBe(true);
    expect(doitAlerter("RUPTURE", "RUPTURE")).toBe(false);
    expect(doitAlerter("RUPTURE", "BAS")).toBe(false); // une amélioration ne réalerte pas
    expect(doitAlerter("BAS", "OK")).toBe(false);
    expect(doitAlerter(null, null)).toBe(false);
  });

  test("le niveau mémorisé retombe à nul quand le stock redevient correct", () => {
    expect(niveauApresVerification("OK")).toBeNull();
    expect(niveauApresVerification(null)).toBeNull();
    expect(niveauApresVerification("BAS")).toBe("BAS");
    expect(niveauApresVerification("RUPTURE")).toBe("RUPTURE");
  });
});

describe("Alertes de stock — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Alerte A ${suffixe}`;
  const nomB = `TEST Alerte B ${suffixe}`;
  const emailAdmin = `alerte-a-${suffixe}@vertexone.test`;
  let A: string;
  let B: string;
  let uA: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "commerce", gereStock: true }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: emailAdmin, nomComplet: "Admin Alerte A", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    await db.insert(utilisateur).values({ entrepriseId: A, email: `alerte-emp-${suffixe}@vertexone.test`, nomComplet: "Employe Alerte", role: "EMPLOYE" });
    await avecEntreprise(A, async (tx) => {
      const p = (nom: string, valeurs: Partial<typeof produit.$inferInsert>) => tx.insert(produit).values({ entrepriseId: A, type: "BIEN", nom, suiviStock: true, creeParId: uA, ...valeurs }).returning({ id: produit.id });
      ids.bas = (await p("Article bas", { stockActuel: 2, seuilAlerte: 5 }))[0].id;
      ids.rupture = (await p("Article rupture", { stockActuel: 0, seuilAlerte: 5 }))[0].id;
      ids.ok = (await p("Article correct", { stockActuel: 50, seuilAlerte: 5 }))[0].id;
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const passer = () => avecEntreprise(A, (tx) => traiterAlertesStock(tx, A));
  const fixer = (id: string, stock: number) => avecEntreprise(A, (tx) => tx.update(produit).set({ stockActuel: stock }).where(eq(produit.id, id)));
  const niveau = async (id: string) => (await avecEntreprise(A, (tx) => tx.select({ n: produit.alerteStockNiveau }).from(produit).where(eq(produit.id, id))))[0].n;

  test("premier passage : un seul email aux administrateurs, les deux produits signalés, la rupture en premier", async () => {
    envoyerEmail.mockClear();
    const r = await passer();
    expect(r).toMatchObject({ actif: true, produitsSignales: 2, adresses: 1 });
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
    const arg = (envoyerEmail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }])[0];
    expect(arg.to).toBe(emailAdmin);
    expect(arg.subject).toContain("1 produit(s) en rupture");
    expect(arg.html.indexOf("Article rupture")).toBeLessThan(arg.html.indexOf("Article bas"));
    expect(arg.html).not.toContain("Article correct");
    expect(await niveau(ids.bas)).toBe("BAS");
    expect(await niveau(ids.rupture)).toBe("RUPTURE");
    expect(await niveau(ids.ok)).toBeNull();
  }, 120_000);

  test("deuxième passage sans changement : aucun email ; une aggravation alerte ; un retour à la normale réarme", async () => {
    envoyerEmail.mockClear();
    expect((await passer()).produitsSignales).toBe(0);
    expect(envoyerEmail).not.toHaveBeenCalled();

    await fixer(ids.bas, 0); // stock bas -> rupture
    expect((await passer()).produitsSignales).toBe(1);
    expect(await niveau(ids.bas)).toBe("RUPTURE");

    await fixer(ids.bas, 40); // réapprovisionné
    expect((await passer()).produitsSignales).toBe(0);
    expect(await niveau(ids.bas)).toBeNull();

    envoyerEmail.mockClear();
    await fixer(ids.bas, 1); // de nouveau bas : nouvelle alerte
    expect((await passer()).produitsSignales).toBe(1);
    expect(envoyerEmail).toHaveBeenCalledTimes(1);
  }, 180_000);

  test("alertes coupées ou gestion de stock désactivée : rien n'est envoyé ni marqué", async () => {
    await fixer(ids.ok, 0);
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ alertesStockEmail: false }).where(eq(entreprise.id, A)));
    envoyerEmail.mockClear();
    expect(await passer()).toMatchObject({ actif: false, produitsSignales: 0 });
    expect(envoyerEmail).not.toHaveBeenCalled();
    expect(await niveau(ids.ok)).toBeNull();

    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ alertesStockEmail: true, gereStock: false }).where(eq(entreprise.id, A)));
    expect((await passer()).actif).toBe(false);
    await avecEntreprise(A, (tx) => tx.update(entreprise).set({ gereStock: true }).where(eq(entreprise.id, A)));
  }, 180_000);

  test("fuite entre entreprises : B ne reçoit rien de A et ne touche pas ses produits", async () => {
    envoyerEmail.mockClear();
    const r = await avecEntreprise(B, (tx) => traiterAlertesStock(tx, B));
    expect(r).toMatchObject({ actif: true, produitsSignales: 0 });
    expect(envoyerEmail).not.toHaveBeenCalled();
    expect(await niveau(ids.rupture)).toBe("RUPTURE");
  }, 120_000);
});
