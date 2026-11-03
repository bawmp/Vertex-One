import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise } from "@/db/schema";
import { calculerBalance, type LigneBalance } from "./etats-financiers";
import { lignesExerciceSansCloture, moisDebutExercice, periodeExercice } from "./cloture";
import { construireBalance, type LigneLivre } from "./livres";
import { construireBilan, construireCompteDeResultat, type Bilan, type CompteDeResultatSyscohada } from "./etats-syscohada";

export type EtatsFinanciers = {
  annee: number;
  /** Premier mois de l'exercice (1 = année civile) : les titres affichent les vraies dates de début et de fin. */
  moisDebut: number;
  entreprise: { nom: string; niu: string | null; adresse: string | null; ville: string | null };
  bilan: Bilan;
  resultat: CompteDeResultatSyscohada;
};

/** Soldes de mouvement des comptes de gestion (6, 7, 8) d'un exercice, sans son écriture de clôture : un exercice clôturé garde son résultat lisible. */
export function soldesDeGestion(lignes: LigneLivre[]): LigneBalance[] {
  return construireBalance([], lignes)
    .lignes.filter((l) => l.classe >= 6)
    .map((l) => ({ numero: l.numero, libelle: l.libelle, classe: l.classe, debit: l.mouvementDebit, credit: l.mouvementCredit, solde: l.mouvementDebit - l.mouvementCredit }));
}

/** Bilan à la fin de l'exercice et compte de résultat de l'exercice, présentés par rubriques SYSCOHADA. Lecture seule sous la protection par entreprise. */
export async function lireEtatsFinanciers(tx: TransactionDrizzle, entrepriseId: string, annee: number): Promise<EtatsFinanciers | null> {
  const moisDebut = await moisDebutExercice(tx, entrepriseId);
  const periode = periodeExercice(annee, moisDebut);
  if (!periode) return null;
  const [maSociete] = await tx.select({ nom: entreprise.nom, niu: entreprise.niu, adresse: entreprise.adresse, ville: entreprise.ville }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const [balance, lignes] = await Promise.all([calculerBalance(tx, entrepriseId, periode.au), lignesExerciceSansCloture(tx, entrepriseId, annee)]);
  return {
    annee,
    moisDebut,
    entreprise: { nom: maSociete?.nom ?? "", niu: maSociete?.niu ?? null, adresse: maSociete?.adresse ?? null, ville: maSociete?.ville ?? null },
    bilan: construireBilan(balance),
    resultat: construireCompteDeResultat(soldesDeGestion(lignes)),
  };
}
