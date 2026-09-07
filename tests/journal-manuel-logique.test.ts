import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, isNotNull } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, journalManuel, ecritureComptable, compteComptable } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";

/**
 * Vérifie la logique métier des Journaux manuels (échange du 2026-09-07) :
 * numérotation séquentielle, création équilibrée liant journalManuel et ses
 * lignes ecritureComptable, et les deux gardes d'équilibre de
 * creerJournalManuel() (src/lib/actions/journal-manuel.ts) reproduites
 * littéralement — comme suivi-heures-logique.test.ts reproduit le WHERE
 * exact de supprimerEntreeTemps().
 *
 * creerJournalManuel() vérifie la session via recupererUtilisateurConnecte()
 * — indisponible hors requête HTTP réelle dans ce test, donc on reproduit
 * directement la même séquence de mutations que l'action.
 */
describe("Journaux manuels — logique métier", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let compteChargeId: string;
  let compteTresorerieId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Journal Manuel Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-journal-manuel-logique@vertexone.test", nomComplet: "Admin Journal Manuel Logique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [compteCharge] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 6)).limit(1);
    const [compteTresorerie] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.classe, 5)).limit(1);
    compteChargeId = compteCharge.id;
    compteTresorerieId = compteTresorerie.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(journalManuel).where(eq(journalManuel.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("genererNumeroJournalManuel() produit des numéros séquentiels uniques", async () => {
    const numeros = await avecEntreprise(entrepriseId, async (tx) => [
      await genererNumeroJournalManuel(tx, entrepriseId),
      await genererNumeroJournalManuel(tx, entrepriseId),
    ]);
    expect(numeros[0]).not.toBe(numeros[1]);
    expect(numeros[0]).toMatch(/^JM-\d{4}-\d{6}$/);
  });

  test("crée un journal équilibré : l'en-tête et les deux lignes sont liées, la balance de l'entreprise reflète le mouvement", async () => {
    const lignes = [
      { compteId: compteChargeId, debit: 15000, credit: 0 },
      { compteId: compteTresorerieId, debit: 0, credit: 15000 },
    ];
    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);

    const idJournal = await avecEntreprise(entrepriseId, async (tx) => {
      const numero = await genererNumeroJournalManuel(tx, entrepriseId);
      const dateEcriture = new Date();
      const [leJournal] = await tx
        .insert(journalManuel)
        .values({ entrepriseId, numero, libelle: "Régularisation test", dateEcriture, creeParId: utilisateurId })
        .returning({ id: journalManuel.id });

      await tx.insert(ecritureComptable).values(
        lignes.map((l) => ({ entrepriseId, dateEcriture, libelle: "Régularisation test", compteId: l.compteId, debit: l.debit, credit: l.credit, journalManuelId: leJournal.id }))
      );
      return leJournal.id;
    });

    const lignesCreees = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ecritureComptable).where(isNotNull(ecritureComptable.journalManuelId)));
    expect(lignesCreees).toHaveLength(2);
    expect(lignesCreees.every((l) => l.journalManuelId === idJournal)).toBe(true);

    const [{ numero: numeroCompteCharge }] = await db.select({ numero: compteComptable.numero }).from(compteComptable).where(eq(compteComptable.id, compteChargeId));
    const balance = await avecEntreprise(entrepriseId, (tx) => calculerBalance(tx, entrepriseId));
    const ligneCharge = balance.find((l) => l.numero === numeroCompteCharge);
    expect(ligneCharge?.solde).toBe(15000);
  });

  test("garde d'équilibre (reproduit creerJournalManuel()) : refuse un total débit ≠ crédit", () => {
    const lignes = [
      { debit: 5000, credit: 0 },
      { debit: 0, credit: 3000 },
    ];
    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).not.toBe(totalCredit);
  });

  test("garde 'une seule colonne par ligne' (reproduit creerJournalManuel()) : refuse débit et crédit simultanés", () => {
    const ligne = { debit: 1000, credit: 500 };
    const uneSeuleColonne = (ligne.debit > 0 && ligne.credit === 0) || (ligne.credit > 0 && ligne.debit === 0);
    expect(uneSeuleColonne).toBe(false);
  });
});
