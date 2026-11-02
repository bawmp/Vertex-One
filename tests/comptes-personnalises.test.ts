import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { compteComptable, ecritureComptable, entreprise } from "@/db/schema";
import { classeDuNumero } from "@/lib/comptabilite/classe-compte";
import { creerComptePersonnalise, renommerComptePersonnalise, supprimerComptePersonnalise } from "@/lib/comptabilite/comptes-personnalises";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

describe("Comptes personnalisés — règle pure", () => {
  test("un numéro valide a 6 chiffres et commence par une classe de 1 à 8", () => {
    expect(classeDuNumero("605100")).toBe(6);
    expect(classeDuNumero("512001")).toBe(5);
    for (const mauvais of ["60510", "6051000", "905100", "005100", "60510a", "", " 605100"]) expect(classeDuNumero(mauvais)).toBeNull();
  });
});

describe("Comptes personnalisés — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomA = `TEST Comptes A ${suffixe}`;
  const nomB = `TEST Comptes B ${suffixe}`;
  let entrepriseA: string;
  let entrepriseB: string;

  beforeAll(async () => {
    const [a] = await db.insert(entreprise).values({ nom: nomA, secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [b] = await db.insert(entreprise).values({ nom: nomB, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseA = a.id;
    entrepriseB = b.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomA);
    await supprimerEntrepriseDeTest(nomB);
  }, 240_000);

  const creer = (entrepriseId: string, numero: string, libelle = "Fournitures de bureau") => avecEntreprise(entrepriseId, (tx) => creerComptePersonnalise(tx, entrepriseId, numero, libelle));
  const numeros = (entrepriseId: string) => avecEntreprise(entrepriseId, async (tx) => (await tx.select({ numero: compteComptable.numero }).from(compteComptable)).map((c) => c.numero));

  test("création : classe déduite du numéro, intitulé nettoyé ; numéro du référentiel ou déjà pris refusé", async () => {
    const ok = await creer(entrepriseA, "605100", "  Fournitures   de bureau ");
    expect(ok.ok).toBe(true);
    const [compte] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605100")));
    expect(compte).toMatchObject({ classe: 6, libelle: "Fournitures de bureau", entrepriseId: entrepriseA });

    expect((await creer(entrepriseA, "605100")).ok).toBe(false); // déjà pris par l'entreprise
    expect((await creer(entrepriseA, "411000")).ok).toBe(false); // numéro du référentiel
    expect((await creer(entrepriseA, "60510")).ok).toBe(false);
    expect((await creer(entrepriseA, "905100")).ok).toBe(false);
    expect((await creer(entrepriseA, "605101", "x")).ok).toBe(false);
    expect((await creer(entrepriseA, "605102", "y".repeat(81))).ok).toBe(false);
  });

  test("le référentiel reste visible de tous, un compte personnalisé de A reste invisible de B", async () => {
    const chezA = await numeros(entrepriseA);
    const chezB = await numeros(entrepriseB);
    expect(chezA).toContain("605100");
    expect(chezA).toContain("411000");
    expect(chezB).not.toContain("605100");
    expect(chezB).toContain("411000");
    // Sans session (aucune entreprise positionnée) : le référentiel seul.
    const sansSession = (await db.select({ numero: compteComptable.numero }).from(compteComptable)).map((c) => c.numero);
    expect(sansSession).toContain("411000");
    expect(sansSession).not.toContain("605100");
  });

  test("deux entreprises peuvent créer le même numéro personnalisé, chacune le sien", async () => {
    expect((await creer(entrepriseB, "605100", "Papeterie")).ok).toBe(true);
    const [chezB] = await avecEntreprise(entrepriseB, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605100")));
    expect(chezB.libelle).toBe("Papeterie");
    expect(chezB.entrepriseId).toBe(entrepriseB);
    const [chezA] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605100")));
    expect(chezA.libelle).toBe("Fournitures de bureau");
  });

  test("fuite : B ne peut ni renommer ni supprimer le compte de A, ni écrire au nom de A, ni toucher au référentiel", async () => {
    const [compteA] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605100")));
    expect((await avecEntreprise(entrepriseB, (tx) => renommerComptePersonnalise(tx, entrepriseB, compteA.id, "Piraté"))).ok).toBe(false);
    expect((await avecEntreprise(entrepriseB, (tx) => supprimerComptePersonnalise(tx, entrepriseB, compteA.id))).ok).toBe(false);
    await expect(avecEntreprise(entrepriseB, (tx) => tx.insert(compteComptable).values({ numero: "605777", libelle: "Faux", classe: 6, entrepriseId: entrepriseA }))).rejects.toThrow();
    await expect(avecEntreprise(entrepriseB, (tx) => tx.insert(compteComptable).values({ numero: "605778", libelle: "Global", classe: 6 }))).rejects.toThrow();

    const [global] = await db.select().from(compteComptable).where(eq(compteComptable.numero, "411000"));
    expect((await avecEntreprise(entrepriseA, (tx) => renommerComptePersonnalise(tx, entrepriseA, global.id, "Piraté"))).ok).toBe(false);
    expect((await avecEntreprise(entrepriseA, (tx) => supprimerComptePersonnalise(tx, entrepriseA, global.id))).ok).toBe(false);
    const [relu] = await db.select().from(compteComptable).where(eq(compteComptable.numero, "411000"));
    expect(relu.libelle).toBe(global.libelle);
  });

  test("renommer : seul l'intitulé change ; supprimer : refusé quand une écriture s'appuie dessus, accepté sinon", async () => {
    const [compte] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605100")));
    expect((await avecEntreprise(entrepriseA, (tx) => renommerComptePersonnalise(tx, entrepriseA, compte.id, "Papeterie et fournitures"))).ok).toBe(true);
    const [renomme] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.id, compte.id)));
    expect(renomme).toMatchObject({ numero: "605100", libelle: "Papeterie et fournitures", classe: 6 });

    await avecEntreprise(entrepriseA, (tx) => tx.insert(ecritureComptable).values({ entrepriseId: entrepriseA, dateEcriture: new Date(), libelle: "Achat de papier", compteId: compte.id, debit: 500, credit: 0 }));
    const refus = await avecEntreprise(entrepriseA, (tx) => supprimerComptePersonnalise(tx, entrepriseA, compte.id));
    expect(refus.ok).toBe(false);
    // La transaction principale reste utilisable après le refus : le compte est toujours là.
    expect(await numeros(entrepriseA)).toContain("605100");

    await avecEntreprise(entrepriseA, (tx) => tx.delete(ecritureComptable).where(eq(ecritureComptable.compteId, compte.id)));
    expect((await avecEntreprise(entrepriseA, (tx) => supprimerComptePersonnalise(tx, entrepriseA, compte.id))).ok).toBe(true);
    expect(await numeros(entrepriseA)).not.toContain("605100");
  });

  test("une écriture sur un compte personnalisé apparaît dans la balance de son entreprise", async () => {
    await creer(entrepriseA, "605200", "Abonnements");
    const [compte] = await avecEntreprise(entrepriseA, (tx) => tx.select().from(compteComptable).where(eq(compteComptable.numero, "605200")));
    await avecEntreprise(entrepriseA, (tx) => tx.insert(ecritureComptable).values({ entrepriseId: entrepriseA, dateEcriture: new Date(), libelle: "Abonnement", compteId: compte.id, debit: 1000, credit: 0 }));
    const { calculerBalance } = await import("@/lib/comptabilite/etats-financiers");
    const balance = await avecEntreprise(entrepriseA, (tx) => calculerBalance(tx, entrepriseA));
    expect(balance.find((l) => l.numero === "605200")).toMatchObject({ libelle: "Abonnements", classe: 6, debit: 1000 });
  });
});
