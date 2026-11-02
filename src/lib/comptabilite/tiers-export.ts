import type { BalanceAgee, NatureTiers, TiersGrandLivre } from "./tiers";
import { TRANCHES_AGE } from "./tiers";
import type { TableauCsv } from "./livres-export";

const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(d);
const n = String;

export function csvGrandLivreAuxiliaire(tiers: TiersGrandLivre[], nature: NatureTiers): TableauCsv {
  const lignes: string[][] = [];
  for (const t of tiers) {
    lignes.push([t.nom, "", "Solde reporté", "", "", "", n(t.soldeOuverture), ""]);
    for (const l of t.lignes) lignes.push([t.nom, jour(l.date), l.libelle, l.documentNumero ?? "", n(l.debit), n(l.credit), n(l.soldeCumule), l.lettre ?? ""]);
    lignes.push([t.nom, "", "Total", "", n(t.totalDebit), n(t.totalCredit), n(t.soldeCloture), ""]);
  }
  return { entetes: [nature === "CLIENT" ? "Client" : "Fournisseur", "Date", "Libellé", "Document", "Débit", "Crédit", "Solde cumulé", "Lettrage"], lignes };
}

export function csvBalanceAgee(b: BalanceAgee, nature: NatureTiers): TableauCsv {
  const lignes = b.lignes.map((l) => [l.nom, ...TRANCHES_AGE.map((t) => n(l.tranches[t])), n(l.total)]);
  lignes.push(["TOTAL", ...TRANCHES_AGE.map((t) => n(b.totaux[t])), n(b.total)]);
  return { entetes: [nature === "CLIENT" ? "Client" : "Fournisseur", ...TRANCHES_AGE, "Total dû"], lignes };
}
