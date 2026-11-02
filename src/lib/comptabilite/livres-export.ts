import type { BalancePeriode, CompteGrandLivre, JournalPeriode } from "./livres";

/** Tableaux prêts pour `ecrireCsv` (montants en entiers bruts, sans séparateur de milliers, pour qu'un tableur les additionne). */
export type TableauCsv = { entetes: string[]; lignes: string[][] };

const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(d);
const n = (v: number) => String(v);

export function csvGrandLivre(comptes: CompteGrandLivre[]): TableauCsv {
  const lignes: string[][] = [];
  for (const c of comptes) {
    lignes.push([c.numero, c.libelle, "", "Solde reporté", "", "", n(c.soldeOuverture)]);
    for (const l of c.lignes) lignes.push([c.numero, c.libelle, jour(l.date), l.libelle, n(l.debit), n(l.credit), n(l.soldeCumule)]);
    lignes.push([c.numero, c.libelle, "", "Total du compte", n(c.totalDebit), n(c.totalCredit), n(c.soldeCloture)]);
  }
  return { entetes: ["Compte", "Intitulé", "Date", "Libellé", "Débit", "Crédit", "Solde cumulé"], lignes };
}

export function csvBalance(b: BalancePeriode): TableauCsv {
  const lignes = b.lignes.map((l) => [l.numero, l.libelle, n(l.ouvertureDebit), n(l.ouvertureCredit), n(l.mouvementDebit), n(l.mouvementCredit), n(l.clotureDebit), n(l.clotureCredit)]);
  const t = b.totaux;
  lignes.push(["", "TOTAL", n(t.ouvertureDebit), n(t.ouvertureCredit), n(t.mouvementDebit), n(t.mouvementCredit), n(t.clotureDebit), n(t.clotureCredit)]);
  return { entetes: ["Compte", "Intitulé", "Ouverture débit", "Ouverture crédit", "Mouvements débit", "Mouvements crédit", "Clôture débit", "Clôture crédit"], lignes };
}

export function csvJournaux(journaux: JournalPeriode[]): TableauCsv {
  const lignes: string[][] = [];
  for (const j of journaux) for (const l of j.lignes) lignes.push([j.code, j.libelle, jour(l.date), l.libelle, l.numeroCompte, l.libelleCompte, n(l.debit), n(l.credit)]);
  return { entetes: ["Journal", "Intitulé du journal", "Date", "Libellé", "Compte", "Intitulé du compte", "Débit", "Crédit"], lignes };
}
