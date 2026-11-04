import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, journalManuel, utilisateur } from "@/db/schema";
import { dateDouala } from "@/lib/comptabilite/livres";
import { finExerciceDate } from "@/lib/comptabilite/exercice-regles";
import { exerciceDuBien, planAmortissement } from "@/lib/comptabilite/immobilisations-regles";
import { creerImmobilisation, lireRegistre, passerDotationsExercice } from "@/lib/comptabilite/immobilisations";
import { debutExerciceSuivant, premierJanvierSuivant } from "@/lib/comptabilite/regularisations-regles";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Priorité 4.6 (suite) : amortissements et régularisations suivent l'exercice décalé. */
describe("Exercice décalé — amortissements et régularisations, règles pures", () => {
  test("exercice d'un bien : année civile inchangée, début en juillet décale l'année et le rang du mois", () => {
    const d = (j: string) => dateDouala(j, false)!;
    expect(exerciceDuBien(d("2025-03-10"), 1)).toEqual({ annee: 2025, mois: 3 });
    expect(exerciceDuBien(d("2025-09-10"), 7)).toEqual({ annee: 2026, mois: 3 }); // exercice 2026 = juillet 2025 → juin 2026
    expect(exerciceDuBien(d("2025-07-01"), 7)).toEqual({ annee: 2026, mois: 1 });
    expect(exerciceDuBien(d("2026-06-30"), 7)).toEqual({ annee: 2026, mois: 12 });
    expect(exerciceDuBien(d("2026-07-01"), 7)).toEqual({ annee: 2027, mois: 1 });
  });

  test("première dotation au prorata des mois restants de l'exercice", () => {
    const { annee, mois } = exerciceDuBien(dateDouala("2025-09-10", false)!, 7);
    const plan = planAmortissement({ valeurAcquisition: 1_200_000, valeurResiduelle: 0, dureeAnnees: 5, anneeAcquisition: annee, moisAcquisition: mois });
    expect(plan[0]).toEqual({ annee: 2026, montant: 200_000 }); // 10 mois sur 60 de 1 200 000
    expect(plan[1].annee).toBe(2027);
  });

  test("date de fin d'exercice et reprise au début du suivant", () => {
    expect(finExerciceDate(2026, 1)?.toISOString()).toBe("2026-12-30T23:00:00.000Z");
    expect(finExerciceDate(2026, 7)?.toISOString()).toBe("2026-06-29T23:00:00.000Z");
    expect(debutExerciceSuivant(dateDouala("2026-06-30", false)!, 7).toISOString()).toBe("2026-06-30T23:00:00.000Z"); // 1er juillet 2026
    expect(debutExerciceSuivant(dateDouala("2026-03-15", false)!, 7).toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(debutExerciceSuivant(dateDouala("2026-09-15", false)!, 7).toISOString()).toBe("2027-06-30T23:00:00.000Z");
    expect(debutExerciceSuivant(dateDouala("2026-03-15", false)!, 1).toISOString()).toBe(premierJanvierSuivant(dateDouala("2026-03-15", false)!).toISOString());
  });
});

describe("Exercice décalé — dotations, base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nom = `TEST DecaleImmo ${suffixe}`;
  let E: string;
  let u: string;
  const maintenant = new Date("2026-11-02T10:00:00Z");

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "agence", moisDebutExercice: 7 }).returning({ id: entreprise.id });
    E = e.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: E, email: `dimmo-${suffixe}@vertexone.test`, nomComplet: "Admin DI", role: "ADMIN" }).returning({ id: utilisateur.id });
    u = x.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nom);
  }, 120_000);

  test("exercice 2026 (juillet 2025 → juin 2026) : dotation au prorata, datée du 30 juin 2026, rejouable sans doublon", async () => {
    const r = await avecEntreprise(E, (tx) => creerImmobilisation(tx, E, u, { libelle: "Camion", compteActif: "245000", dateAcquisition: dateDouala("2025-09-10", false)!, valeurAcquisition: 1_200_000, valeurResiduelle: 0, dureeAnnees: 5, contrepartieAcquisition: null }, maintenant));
    expect(r.ok).toBe(true);
    const registre = await avecEntreprise(E, (tx) => lireRegistre(tx, 7));
    expect(registre[0].plan[0]).toEqual({ annee: 2026, montant: 200_000 });

    const dot = await avecEntreprise(E, (tx) => passerDotationsExercice(tx, E, u, 2026, maintenant));
    expect(dot).toMatchObject({ ok: true, nombre: 1, total: 200_000 });
    const [journal] = await avecEntreprise(E, (tx) => tx.select({ date: journalManuel.dateEcriture }).from(journalManuel).where(eq(journalManuel.entrepriseId, E)));
    expect(journal.date.toISOString()).toBe("2026-06-29T23:00:00.000Z"); // 30 juin 2026, minuit à Douala

    expect(await avecEntreprise(E, (tx) => passerDotationsExercice(tx, E, u, 2026, maintenant))).toMatchObject({ ok: true, numero: null, nombre: 0 });
    // L'exercice 2027 n'est pas terminé à la date de référence (nov. 2026 appartient à l'exercice 2027) mais existe : la dotation se passe ;
    // l'exercice 2028 n'existe pas encore.
    expect((await avecEntreprise(E, (tx) => passerDotationsExercice(tx, E, u, 2028, maintenant))).ok).toBe(false);
  }, 120_000);
});
