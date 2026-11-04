import { eq, inArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, dotationAmortissement, ecritureComptable, entreprise, immobilisation, journalManuel } from "@/db/schema";
import { genererNumeroJournalManuel } from "@/lib/facturation/numerotation";
import { m } from "@/lib/i18n/catalogue";
import { verifierDateNonVerrouillee } from "./verrouillage";
import { baseAmortissable, categorieImmobilisation, exerciceDuBien, planAmortissement, type BienAmortissable } from "./immobilisations-regles";
import { finExerciceDate } from "./exercice-regles";
import { moisDebutExercice } from "./cloture";

/** Contreparties proposées pour l'écriture d'acquisition (le bien a été payé par la banque, la caisse, ou est dû au fournisseur). */
export const CONTREPARTIES_ACQUISITION = ["512000", "571000", "401000"] as const;

export type ParametresImmobilisation = {
  libelle: string;
  compteActif: string;
  dateAcquisition: Date;
  valeurAcquisition: number;
  valeurResiduelle: number;
  dureeAnnees: number;
  /** Numéro du compte de contrepartie si l'achat n'est pas encore en comptabilité ; null si c'est déjà fait ailleurs (dépense, journal manuel). */
  contrepartieAcquisition: string | null;
};

export type ResultatSimple = { ok: true; message?: string } | { ok: false; erreur: string };

const anneeCourante = (maintenant: Date, moisDebut: number) => exerciceDuBien(maintenant, moisDebut).annee;

function bienDe(i: { valeurAcquisition: number; valeurResiduelle: number; dureeAnnees: number; dateAcquisition: Date }, moisDebut: number): BienAmortissable {
  const { annee, mois } = exerciceDuBien(i.dateAcquisition, moisDebut);
  return { valeurAcquisition: i.valeurAcquisition, valeurResiduelle: i.valeurResiduelle, dureeAnnees: i.dureeAnnees, anneeAcquisition: annee, moisAcquisition: mois };
}

/** Enregistre un bien au registre, et, si demandé, l'écriture d'acquisition (débit du compte d'immobilisation, crédit de la contrepartie). */
export async function creerImmobilisation(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, p: ParametresImmobilisation, maintenant: Date = new Date()): Promise<ResultatSimple> {
  const libelle = p.libelle.trim();
  if (!libelle) return { ok: false, erreur: m("Le libellé est requis.") };
  const categorie = categorieImmobilisation(p.compteActif);
  if (!categorie) return { ok: false, erreur: m("Catégorie d'immobilisation inconnue.") };
  if (Number.isNaN(p.dateAcquisition.getTime())) return { ok: false, erreur: m("Date invalide.") };
  if (p.dateAcquisition.getTime() > maintenant.getTime() + 24 * 60 * 60 * 1000) return { ok: false, erreur: m("La date ne peut pas être dans le futur.") };
  if (baseAmortissable(p.valeurAcquisition, p.valeurResiduelle) === null) return { ok: false, erreur: m("La valeur d'acquisition doit être un entier positif, et la valeur résiduelle inférieure à celle-ci.") };
  if (!Number.isInteger(p.dureeAnnees) || p.dureeAnnees < 1 || p.dureeAnnees > 50) return { ok: false, erreur: m("La durée d'amortissement doit être de 1 à 50 ans.") };
  if (p.contrepartieAcquisition !== null && !(CONTREPARTIES_ACQUISITION as readonly string[]).includes(p.contrepartieAcquisition)) return { ok: false, erreur: m("Contrepartie d'acquisition inconnue.") };

  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (p.contrepartieAcquisition) {
    const erreur = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, p.dateAcquisition);
    if (erreur) return { ok: false, erreur };
  }

  await tx
    .insert(immobilisation)
    .values({ entrepriseId, libelle, compteActif: p.compteActif, dateAcquisition: p.dateAcquisition, valeurAcquisition: p.valeurAcquisition, valeurResiduelle: p.valeurResiduelle, dureeAnnees: p.dureeAnnees, creeParId: utilisateurId });

  if (p.contrepartieAcquisition) {
    const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, [p.compteActif, p.contrepartieAcquisition]));
    const actif = comptes.find((c) => c.numero === p.compteActif);
    const contre = comptes.find((c) => c.numero === p.contrepartieAcquisition);
    if (!actif || !contre) throw new Error("Plan comptable incomplet : comptes d'acquisition introuvables.");
    const intitule = `Acquisition — ${libelle}`;
    const numero = await genererNumeroJournalManuel(tx, entrepriseId);
    const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle: intitule, dateEcriture: p.dateAcquisition, creeParId: utilisateurId }).returning({ id: journalManuel.id });
    await tx.insert(ecritureComptable).values([
      { entrepriseId, dateEcriture: p.dateAcquisition, libelle: intitule, compteId: actif.id, debit: p.valeurAcquisition, credit: 0, journalManuelId: journal.id },
      { entrepriseId, dateEcriture: p.dateAcquisition, libelle: intitule, compteId: contre.id, debit: 0, credit: p.valeurAcquisition, journalManuelId: journal.id },
    ]);
  }
  return { ok: true };
}

export type LigneRegistre = {
  id: string;
  libelle: string;
  categorie: string;
  compteActif: string;
  dateAcquisition: Date;
  valeurAcquisition: number;
  valeurResiduelle: number;
  dureeAnnees: number;
  /** Total des dotations déjà passées en comptabilité. */
  amortissementsCumules: number;
  /** Valeur nette comptable : acquisition moins amortissements passés. */
  valeurNette: number;
  /** Années dont la dotation est déjà passée. */
  anneesPassees: number[];
  /** Plan prévu (année, montant). */
  plan: { annee: number; montant: number }[];
};

/** `moisDebut` : premier mois de l'exercice de l'entreprise (1 = année civile) ; les années du plan sont des numéros d'exercice. */
export async function lireRegistre(tx: TransactionDrizzle, moisDebut = 1): Promise<LigneRegistre[]> {
  const [biens, dotations] = await Promise.all([
    tx.select().from(immobilisation).orderBy(immobilisation.dateAcquisition),
    tx.select({ immobilisationId: dotationAmortissement.immobilisationId, annee: dotationAmortissement.annee, montant: dotationAmortissement.montant }).from(dotationAmortissement),
  ]);
  return biens.map((b) => {
    const siennes = dotations.filter((d) => d.immobilisationId === b.id);
    const cumul = siennes.reduce((s, d) => s + d.montant, 0);
    return {
      id: b.id,
      libelle: b.libelle,
      categorie: categorieImmobilisation(b.compteActif)?.libelle ?? b.compteActif,
      compteActif: b.compteActif,
      dateAcquisition: b.dateAcquisition,
      valeurAcquisition: b.valeurAcquisition,
      valeurResiduelle: b.valeurResiduelle,
      dureeAnnees: b.dureeAnnees,
      amortissementsCumules: cumul,
      valeurNette: b.valeurAcquisition - cumul,
      anneesPassees: siennes.map((d) => d.annee).sort(),
      plan: planAmortissement(bienDe(b, moisDebut)),
    };
  });
}

/** Supprime un bien du registre — seulement s'il n'a encore aucune dotation passée (sinon la comptabilité en porte la trace). */
export async function supprimerImmobilisation(tx: TransactionDrizzle, id: string): Promise<ResultatSimple> {
  const [bien] = await tx.select({ id: immobilisation.id }).from(immobilisation).where(eq(immobilisation.id, id));
  if (!bien) return { ok: false, erreur: m("Bien introuvable.") };
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(dotationAmortissement).where(eq(dotationAmortissement.immobilisationId, id));
  if (n > 0) return { ok: false, erreur: m("Ce bien a déjà des dotations passées en comptabilité : il ne peut plus être retiré du registre.") };
  await tx.delete(immobilisation).where(eq(immobilisation.id, id));
  return { ok: true };
}

export type ResultatDotations = { ok: true; numero: string | null; nombre: number; total: number } | { ok: false; erreur: string };

/**
 * Passe les dotations aux amortissements d'un exercice : une écriture (débit 681000, crédits des comptes d'amortissement) pour tous les
 * biens dont la dotation de l'année n'est pas encore passée. Rejouable sans risque : un bien déjà traité pour cette année (index unique)
 * est ignoré, donc un second appel ne passe que les biens ajoutés depuis. Date de l'écriture : le dernier jour de l'exercice (le 31
 * décembre pour une année civile). `annee` est le numéro de l'exercice (l'année où il se termine).
 */
export async function passerDotationsExercice(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, annee: number, maintenant: Date = new Date()): Promise<ResultatDotations> {
  const moisDebut = await moisDebutExercice(tx, entrepriseId);
  const date = finExerciceDate(annee, moisDebut);
  if (!Number.isInteger(annee) || annee < 2000 || annee > anneeCourante(maintenant, moisDebut) || !date) return { ok: false, erreur: m("Exercice invalide.") };

  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const erreurVerrou = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, date);
  if (erreurVerrou) return { ok: false, erreur: erreurVerrou };

  const registre = await lireRegistre(tx, moisDebut);
  const aPasser = registre
    .filter((b) => !b.anneesPassees.includes(annee))
    .map((b) => ({ b, montant: b.plan.find((d) => d.annee === annee)?.montant ?? 0 }))
    .filter((x) => x.montant > 0);
  if (aPasser.length === 0) return { ok: true, numero: null, nombre: 0, total: 0 };

  const total = aPasser.reduce((s, x) => s + x.montant, 0);
  const parAmortissement = new Map<string, number>();
  for (const { b, montant } of aPasser) {
    const compte = categorieImmobilisation(b.compteActif)!.compteAmortissement;
    parAmortissement.set(compte, (parAmortissement.get(compte) ?? 0) + montant);
  }
  const numeros = ["681000", ...parAmortissement.keys()];
  const comptes = await tx.select({ id: compteComptable.id, numero: compteComptable.numero }).from(compteComptable).where(inArray(compteComptable.numero, numeros));
  const parNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  if (numeros.some((n) => !parNumero.has(n))) return { ok: false, erreur: m("Le plan comptable ne contient pas les comptes nécessaires : contactez le support.") };

  const libelle = `Dotations aux amortissements ${annee}`;
  const numero = await genererNumeroJournalManuel(tx, entrepriseId);
  const [journal] = await tx.insert(journalManuel).values({ entrepriseId, numero, libelle, dateEcriture: date, creeParId: utilisateurId }).returning({ id: journalManuel.id });
  await tx.insert(ecritureComptable).values([
    { entrepriseId, dateEcriture: date, libelle, compteId: parNumero.get("681000")!, debit: total, credit: 0, journalManuelId: journal.id },
    ...[...parAmortissement].map(([n, montant]) => ({ entrepriseId, dateEcriture: date, libelle, compteId: parNumero.get(n)!, debit: 0, credit: montant, journalManuelId: journal.id })),
  ]);
  await tx.insert(dotationAmortissement).values(aPasser.map(({ b, montant }) => ({ entrepriseId, immobilisationId: b.id, annee, montant, journalManuelId: journal.id })));
  return { ok: true, numero, nombre: aPasser.length, total };
}


