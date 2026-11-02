import { and, eq, gte, like, lte, or } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, ecritureComptable } from "@/db/schema";
import type { Periode } from "./livres";

/**
 * Déclaration de TVA d'une période (2026-11-02), lue dans les écritures comptables :
 * - **TVA collectée** : compte 443200 « État, TVA facturée » (crédits − débits : une écriture d'annulation vient en déduction) ;
 * - **TVA déductible** : compte 445200 « État, TVA récupérable » (débits − crédits) ;
 * - **chiffre d'affaires hors taxe** : comptes de ventes (classe 70) — crédits − débits.
 * Un tableau de travail pour votre comptable, pas une télédéclaration : les montants se reportent sur la déclaration officielle.
 */
export type LigneTva = { id: string; date: Date; libelle: string; montant: number };

export type DeclarationTva = {
  caHT: number;
  tvaCollectee: number;
  tvaDeductible: number;
  collectee: LigneTva[];
  deductible: LigneTva[];
};

export type ResultatTva = {
  /** TVA collectée − TVA déductible − crédit reporté, quand c'est positif. */
  aPayer: number;
  /** Crédit de TVA (la TVA déductible dépasse la collectée) à reporter sur la période suivante. */
  creditAReporter: number;
};

/** Règle pure. `creditReporte` est le crédit de TVA de la période précédente, saisi par l'utilisateur (jamais deviné). */
export function calculerTva(tvaCollectee: number, tvaDeductible: number, creditReporte = 0): ResultatTva {
  const net = tvaCollectee - tvaDeductible - Math.max(0, creditReporte);
  return { aPayer: Math.max(0, net), creditAReporter: Math.max(0, -net) };
}

export async function lireDeclarationTva(tx: TransactionDrizzle, entrepriseId: string, { du, au }: Periode): Promise<DeclarationTva> {
  const lignes = await tx
    .select({ id: ecritureComptable.id, date: ecritureComptable.dateEcriture, libelle: ecritureComptable.libelle, numero: compteComptable.numero, debit: ecritureComptable.debit, credit: ecritureComptable.credit })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .where(
      and(
        eq(ecritureComptable.entrepriseId, entrepriseId),
        gte(ecritureComptable.dateEcriture, du),
        lte(ecritureComptable.dateEcriture, au),
        or(eq(compteComptable.numero, "443200"), eq(compteComptable.numero, "445200"), like(compteComptable.numero, "70%"))
      )
    )
    .orderBy(ecritureComptable.dateEcriture, ecritureComptable.creeLe, ecritureComptable.id);

  const collectee: LigneTva[] = [];
  const deductible: LigneTva[] = [];
  let caHT = 0;
  for (const l of lignes) {
    if (l.numero === "443200") collectee.push({ id: l.id, date: l.date, libelle: l.libelle, montant: l.credit - l.debit });
    else if (l.numero === "445200") deductible.push({ id: l.id, date: l.date, libelle: l.libelle, montant: l.debit - l.credit });
    else caHT += l.credit - l.debit;
  }
  return { caHT, tvaCollectee: collectee.reduce((s, l) => s + l.montant, 0), tvaDeductible: deductible.reduce((s, l) => s + l.montant, 0), collectee, deductible };
}

/** CSV de travail : une ligne de synthèse puis le détail des écritures de TVA. */
export function csvTva(d: DeclarationTva, r: ResultatTva, creditReporte: number): { entetes: string[]; lignes: string[][] } {
  const jour = (x: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(x);
  const lignes: string[][] = [
    ["SYNTHESE", "", "Chiffre d'affaires hors taxe", String(d.caHT)],
    ["SYNTHESE", "", "TVA collectée", String(d.tvaCollectee)],
    ["SYNTHESE", "", "TVA déductible", String(d.tvaDeductible)],
    ["SYNTHESE", "", "Crédit de TVA reporté de la période précédente", String(Math.max(0, creditReporte))],
    ["SYNTHESE", "", "TVA à payer", String(r.aPayer)],
    ["SYNTHESE", "", "Crédit de TVA à reporter", String(r.creditAReporter)],
    ...d.collectee.map((l) => ["TVA COLLECTEE", jour(l.date), l.libelle, String(l.montant)]),
    ...d.deductible.map((l) => ["TVA DEDUCTIBLE", jour(l.date), l.libelle, String(l.montant)]),
  ];
  return { entetes: ["Rubrique", "Date", "Libellé", "Montant"], lignes };
}
