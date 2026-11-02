import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { clotureExercice, compteComptable, ecritureComptable, entreprise, reouvertureExercice, utilisateur } from "@/db/schema";
import { cloturerExercice, dernierExerciceCloture, listerReouvertures, rouvrirExercice } from "@/lib/comptabilite/cloture";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { dateDouala } from "@/lib/comptabilite/livres";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * Priorité 2.2 : rouvrir le dernier exercice clôturé. L'écriture de clôture est contre-passée à la fin de l'exercice (jamais supprimée),
 * le verrou d'avant revient, la clôture disparaît pour pouvoir clôturer de nouveau, tout est tracé, et on remonte dans l'ordre inverse.
 */
describe("Réouverture d'un exercice clôturé", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Reouverture A ${suffixe}`;
  const nomB = `TEST Reouverture B ${suffixe}`;
  let A: string;
  let B: string;
  let uA: string;
  let uB: string;
  const c: Record<string, string> = {};
  const maintenant = new Date("2026-11-02T10:00:00Z");
  const verrouInitial = dateDouala("2021-12-31", true)!;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence", dateVerrouillageComptable: verrouInitial }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    A = a.id;
    B = b.id;
    const [ua] = await db.insert(utilisateur).values({ entrepriseId: A, email: `reouv-a-${suffixe}@vertexone.test`, nomComplet: "Admin Reouv A", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [ub] = await db.insert(utilisateur).values({ entrepriseId: B, email: `reouv-b-${suffixe}@vertexone.test`, nomComplet: "Admin Reouv B", role: "ADMIN" }).returning({ id: utilisateur.id });
    uA = ua.id;
    uB = ub.id;
    const rows = await db.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, ["411000", "512000", "601000", "706000"]));
    for (const r of rows) c[r.numero] = r.id;
    const ec = (compte: string, debit: number, credit: number, date: string, libelle: string) => ({ entrepriseId: A, dateEcriture: new Date(date), libelle, compteId: c[compte], debit, credit });
    await avecEntreprise(A, (tx) =>
      tx.insert(ecritureComptable).values([
        ec("411000", 10000, 0, "2023-06-10T10:00:00Z", "Facture 2023"),
        ec("706000", 0, 10000, "2023-06-10T10:00:00Z", "Facture 2023"),
        ec("601000", 4000, 0, "2023-07-10T10:00:00Z", "Achat 2023"),
        ec("512000", 0, 4000, "2023-07-10T10:00:00Z", "Achat 2023"),
        ec("411000", 1000, 0, "2024-03-10T10:00:00Z", "Facture 2024"),
        ec("706000", 0, 1000, "2024-03-10T10:00:00Z", "Facture 2024"),
      ])
    );
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const verrou = async () => (await avecEntreprise(A, (tx) => tx.select({ v: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, A))))[0].v;
  const soldeGestion = async () => (await avecEntreprise(A, (tx) => calculerBalance(tx, A, dateDouala("2023-12-31", true)!))).filter((l) => l.classe === 6 || l.classe === 7);

  test("clôture 2023 puis réouverture : écriture annulée à la fin de l'exercice, verrou d'avant rétabli, trace conservée", async () => {
    expect((await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2023, maintenant))).ok).toBe(true);
    expect((await verrou())?.toISOString()).toBe("2023-12-31T22:59:59.999Z");
    expect((await soldeGestion()).every((l) => l.solde === 0)).toBe(true);
    expect(await avecEntreprise(A, (tx) => dernierExerciceCloture(tx, A))).toBe(2023);

    const r = await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2023, "Facture oubliée à ajouter"));
    expect(r).toEqual({ ok: true, resultatAnnule: 6000 });
    expect((await verrou())?.toISOString()).toBe(verrouInitial.toISOString()); // le verrou d'AVANT la clôture revient
    expect(await avecEntreprise(A, (tx) => tx.select().from(clotureExercice))).toEqual([]);
    expect(await avecEntreprise(A, (tx) => dernierExerciceCloture(tx, A))).toBeNull();

    // Les produits et charges de 2023 sont de nouveau visibles à la fin de 2023, et la comptabilité reste équilibrée.
    const gestion = await soldeGestion();
    expect(gestion.find((l) => l.numero === "706000")?.solde).toBe(-10000);
    expect(gestion.find((l) => l.numero === "601000")?.solde).toBe(4000);
    const total = await avecEntreprise(A, (tx) => calculerBalance(tx, A));
    expect(total.reduce((s, l) => s + l.debit, 0)).toBe(total.reduce((s, l) => s + l.credit, 0));

    const traces = await avecEntreprise(A, (tx) => listerReouvertures(tx, A));
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ annee: 2023, motif: "Facture oubliée à ajouter", resultatAnnule: 6000, rouvertPar: uA });
    // L'écriture de clôture n'est jamais supprimée : elle et son annulation restent au grand livre.
    const lignes = await avecEntreprise(A, (tx) => tx.select().from(ecritureComptable).where(eq(ecritureComptable.libelle, "Clôture de l'exercice 2023")));
    expect(lignes.length).toBeGreaterThan(0);
  });

  test("on peut corriger puis clôturer de nouveau ; une réouverture sans clôture ou sans motif est refusée", async () => {
    expect((await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2023, "Encore"))).ok).toBe(false); // plus clôturé
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values({ entrepriseId: A, dateEcriture: new Date("2023-11-01T10:00:00Z"), libelle: "Charge oubliée", compteId: c["601000"], debit: 500, credit: 0 }));
    await avecEntreprise(A, (tx) => tx.insert(ecritureComptable).values({ entrepriseId: A, dateEcriture: new Date("2023-11-01T10:00:00Z"), libelle: "Charge oubliée", compteId: c["512000"], debit: 0, credit: 500 }));
    const r = await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2023, maintenant));
    expect(r).toMatchObject({ ok: true, resultatNet: 5500 }); // 10 000 − 4 000 − 500
    expect((await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2023, "x"))).ok).toBe(false); // motif trop court
    expect(await avecEntreprise(A, (tx) => tx.select().from(clotureExercice))).toHaveLength(1);
  });

  test("on remonte dans l'ordre inverse : 2023 ne se rouvre pas tant que 2024 est clôturé", async () => {
    expect((await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2024, maintenant))).ok).toBe(true);
    const refus = await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2023, "Trop tôt pour 2023"));
    expect(refus.ok).toBe(false);
    expect((await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2024, "Retour sur 2024"))).ok).toBe(true);
    expect((await avecEntreprise(A, (tx) => rouvrirExercice(tx, A, uA, 2023, "Maintenant possible"))).ok).toBe(true);
    expect(await avecEntreprise(A, (tx) => tx.select().from(reouvertureExercice))).toHaveLength(3);
  });

  test("fuite entre entreprises : B ne voit ni ne rouvre une clôture de A", async () => {
    await avecEntreprise(A, (tx) => cloturerExercice(tx, A, uA, 2023, maintenant));
    expect(await avecEntreprise(B, (tx) => listerReouvertures(tx, B))).toEqual([]);
    expect(await avecEntreprise(B, (tx) => dernierExerciceCloture(tx, B))).toBeNull();
    expect((await avecEntreprise(B, (tx) => rouvrirExercice(tx, B, uB, 2023, "Tentative de B"))).ok).toBe(false);
    expect(await avecEntreprise(A, (tx) => dernierExerciceCloture(tx, A))).toBe(2023);
  });
});
