import { and, asc, eq, gte, lte, lt } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { compteComptable, ecritureComptable } from "@/db/schema";

/**
 * Livres comptables (2026-11-02) : grand livre, balance générale et journaux par période. Tout se lit dans `ecriture_comptable`
 * (une seule source, la même que le bilan et le compte de résultat), sous la protection par entreprise : jamais l'écriture d'une
 * autre. Montants en FCFA entiers, solde = débit − crédit (positif = débiteur, négatif = créditeur).
 */

export type Periode = { du: Date; au: Date };

/** « 2026-03-15 » → instant exact à Douala (UTC+1). Renvoie null si le texte n'est pas une date réelle. */
export function dateDouala(texte: string | undefined | null, finDeJournee: boolean): Date | null {
  if (!texte || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return null;
  const d = new Date(`${texte}T${finDeJournee ? "23:59:59.999" : "00:00:00.000"}+01:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Refuse 2026-02-31 : la date relue doit redonner le même jour.
  const relu = new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
  return relu === texte ? d : null;
}

const jourTexte = (d: Date) => new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);

export type NomPeriode = "mois" | "mois-dernier" | "trimestre" | "annee" | "annee-derniere";

/** Périodes proposées en un clic, calculées à l'heure de Douala. */
export function periodePredefinie(nom: NomPeriode, maintenant: Date): { du: string; au: string } {
  const aujourdhui = jourTexte(maintenant);
  const annee = Number(aujourdhui.slice(0, 4));
  const mois = Number(aujourdhui.slice(5, 7));
  const dernierJour = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const iso = (a: number, m: number, j: number) => `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  if (nom === "mois") return { du: iso(annee, mois, 1), au: iso(annee, mois, dernierJour(annee, mois)) };
  if (nom === "mois-dernier") {
    const a = mois === 1 ? annee - 1 : annee;
    const m = mois === 1 ? 12 : mois - 1;
    return { du: iso(a, m, 1), au: iso(a, m, dernierJour(a, m)) };
  }
  if (nom === "trimestre") {
    const debut = Math.floor((mois - 1) / 3) * 3 + 1;
    return { du: iso(annee, debut, 1), au: iso(annee, debut + 2, dernierJour(annee, debut + 2)) };
  }
  if (nom === "annee-derniere") return { du: iso(annee - 1, 1, 1), au: iso(annee - 1, 12, 31) };
  return { du: iso(annee, 1, 1), au: iso(annee, 12, 31) };
}

/** Journal d'une écriture, déduit de son origine (les écritures n'ont pas de code de journal enregistré). */
export type CodeJournal = "VT" | "AC" | "TR" | "OD";
export const LIBELLE_JOURNAL: Record<CodeJournal, string> = {
  VT: "Journal des ventes",
  AC: "Journal des achats",
  TR: "Journal de trésorerie",
  OD: "Opérations diverses",
};

export type OrigineEcriture = {
  factureId: string | null;
  paiementId: string | null;
  depenseId: string | null;
  factureFournisseurId: string | null;
  paiementEffectueId: string | null;
  recuVenteId: string | null;
  factureAcompteId: string | null;
  journalManuelId: string | null;
};

/**
 * Ventes : facture, acompte, ticket de vente (sauf règlement, classé en trésorerie). Achats : dépense, facture fournisseur.
 * Trésorerie : règlement reçu ou payé. Opérations diverses : journal manuel et tout ce qui n'a pas d'origine reconnue.
 */
export function journalDeEcriture(e: OrigineEcriture): CodeJournal {
  if (e.journalManuelId) return "OD";
  if (e.paiementId || e.paiementEffectueId) return "TR";
  if (e.depenseId || e.factureFournisseurId) return "AC";
  if (e.factureId || e.recuVenteId || e.factureAcompteId) return "VT";
  return "OD";
}

export type LigneLivre = {
  id: string;
  date: Date;
  libelle: string;
  numeroCompte: string;
  libelleCompte: string;
  debit: number;
  credit: number;
  journal: CodeJournal;
};

export async function lireLignes(tx: TransactionDrizzle, entrepriseId: string, conditionsSup: ReturnType<typeof and>[]): Promise<LigneLivre[]> {
  const lignes = await tx
    .select({
      id: ecritureComptable.id,
      date: ecritureComptable.dateEcriture,
      libelle: ecritureComptable.libelle,
      numeroCompte: compteComptable.numero,
      libelleCompte: compteComptable.libelle,
      debit: ecritureComptable.debit,
      credit: ecritureComptable.credit,
      factureId: ecritureComptable.factureId,
      paiementId: ecritureComptable.paiementId,
      depenseId: ecritureComptable.depenseId,
      factureFournisseurId: ecritureComptable.factureFournisseurId,
      paiementEffectueId: ecritureComptable.paiementEffectueId,
      recuVenteId: ecritureComptable.recuVenteId,
      factureAcompteId: ecritureComptable.factureAcompteId,
      journalManuelId: ecritureComptable.journalManuelId,
    })
    .from(ecritureComptable)
    .innerJoin(compteComptable, eq(ecritureComptable.compteId, compteComptable.id))
    .where(and(eq(ecritureComptable.entrepriseId, entrepriseId), ...conditionsSup))
    .orderBy(asc(ecritureComptable.dateEcriture), asc(ecritureComptable.creeLe), asc(ecritureComptable.id));
  return lignes.map((l) => ({ id: l.id, date: l.date, libelle: l.libelle, numeroCompte: l.numeroCompte, libelleCompte: l.libelleCompte, debit: l.debit, credit: l.credit, journal: journalDeEcriture(l) }));
}

/* ----------------------------- Grand livre ----------------------------- */

export type LigneGrandLivre = LigneLivre & { soldeCumule: number };
export type CompteGrandLivre = {
  numero: string;
  libelle: string;
  /** Solde reporté : cumul de toutes les écritures AVANT le début de la période. */
  soldeOuverture: number;
  lignes: LigneGrandLivre[];
  totalDebit: number;
  totalCredit: number;
  soldeCloture: number;
};

/** Règle pure : regroupe des lignes par compte, calcule le solde reporté, le solde cumulé ligne par ligne et les totaux. */
export function construireGrandLivre(avant: LigneLivre[], periode: LigneLivre[]): CompteGrandLivre[] {
  const ouverture = new Map<string, number>();
  const noms = new Map<string, string>();
  for (const l of avant) {
    ouverture.set(l.numeroCompte, (ouverture.get(l.numeroCompte) ?? 0) + l.debit - l.credit);
    noms.set(l.numeroCompte, l.libelleCompte);
  }
  const parCompte = new Map<string, LigneLivre[]>();
  for (const l of periode) {
    noms.set(l.numeroCompte, l.libelleCompte);
    (parCompte.get(l.numeroCompte) ?? parCompte.set(l.numeroCompte, []).get(l.numeroCompte)!).push(l);
  }
  const numeros = new Set<string>([...parCompte.keys(), ...[...ouverture.entries()].filter(([, s]) => s !== 0).map(([n]) => n)]);
  return [...numeros]
    .sort((a, b) => a.localeCompare(b))
    .map((numero) => {
      const soldeOuverture = ouverture.get(numero) ?? 0;
      let cumul = soldeOuverture;
      let totalDebit = 0;
      let totalCredit = 0;
      const lignes = (parCompte.get(numero) ?? []).map((l) => {
        cumul += l.debit - l.credit;
        totalDebit += l.debit;
        totalCredit += l.credit;
        return { ...l, soldeCumule: cumul };
      });
      return { numero, libelle: noms.get(numero) ?? numero, soldeOuverture, lignes, totalDebit, totalCredit, soldeCloture: cumul };
    });
}

export async function lireGrandLivre(tx: TransactionDrizzle, entrepriseId: string, { du, au }: Periode, numeroCompte?: string): Promise<CompteGrandLivre[]> {
  const filtreCompte = numeroCompte ? [eq(compteComptable.numero, numeroCompte)] : [];
  const [avant, periode] = await Promise.all([
    lireLignes(tx, entrepriseId, [lt(ecritureComptable.dateEcriture, du), ...filtreCompte]),
    lireLignes(tx, entrepriseId, [gte(ecritureComptable.dateEcriture, du), lte(ecritureComptable.dateEcriture, au), ...filtreCompte]),
  ]);
  return construireGrandLivre(avant, periode);
}

/* ------------------------------- Balance ------------------------------- */

export type LigneBalancePeriode = {
  numero: string;
  libelle: string;
  classe: number;
  ouvertureDebit: number;
  ouvertureCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  clotureDebit: number;
  clotureCredit: number;
};
export type BalancePeriode = {
  lignes: LigneBalancePeriode[];
  totaux: { ouvertureDebit: number; ouvertureCredit: number; mouvementDebit: number; mouvementCredit: number; clotureDebit: number; clotureCredit: number };
  /** Vrai quand total débit = total crédit sur les mouvements ET sur les soldes : la comptabilité est équilibrée. */
  equilibree: boolean;
};

/** Règle pure : balance à six colonnes (ouverture, mouvements, clôture), un solde ne figurant que d'un seul côté. */
export function construireBalance(avant: LigneLivre[], periode: LigneLivre[]): BalancePeriode {
  const comptes = new Map<string, { libelle: string; od: number; oc: number; md: number; mc: number }>();
  const ligne = (l: LigneLivre) => comptes.get(l.numeroCompte) ?? comptes.set(l.numeroCompte, { libelle: l.libelleCompte, od: 0, oc: 0, md: 0, mc: 0 }).get(l.numeroCompte)!;
  for (const l of avant) {
    const c = ligne(l);
    c.od += l.debit;
    c.oc += l.credit;
  }
  for (const l of periode) {
    const c = ligne(l);
    c.md += l.debit;
    c.mc += l.credit;
  }
  const cote = (solde: number) => ({ debit: solde > 0 ? solde : 0, credit: solde < 0 ? -solde : 0 });
  const lignes: LigneBalancePeriode[] = [...comptes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([numero, c]) => {
      const ouverture = cote(c.od - c.oc);
      const cloture = cote(c.od - c.oc + c.md - c.mc);
      return {
        numero,
        libelle: c.libelle,
        classe: Number(numero[0]),
        ouvertureDebit: ouverture.debit,
        ouvertureCredit: ouverture.credit,
        mouvementDebit: c.md,
        mouvementCredit: c.mc,
        clotureDebit: cloture.debit,
        clotureCredit: cloture.credit,
      };
    })
    .filter((l) => l.ouvertureDebit || l.ouvertureCredit || l.mouvementDebit || l.mouvementCredit);
  const somme = (cle: keyof LigneBalancePeriode) => lignes.reduce((s, l) => s + (l[cle] as number), 0);
  const totaux = {
    ouvertureDebit: somme("ouvertureDebit"),
    ouvertureCredit: somme("ouvertureCredit"),
    mouvementDebit: somme("mouvementDebit"),
    mouvementCredit: somme("mouvementCredit"),
    clotureDebit: somme("clotureDebit"),
    clotureCredit: somme("clotureCredit"),
  };
  return { lignes, totaux, equilibree: totaux.mouvementDebit === totaux.mouvementCredit && totaux.clotureDebit === totaux.clotureCredit && totaux.ouvertureDebit === totaux.ouvertureCredit };
}

export async function lireBalancePeriode(tx: TransactionDrizzle, entrepriseId: string, { du, au }: Periode): Promise<BalancePeriode> {
  const [avant, periode] = await Promise.all([
    lireLignes(tx, entrepriseId, [lt(ecritureComptable.dateEcriture, du)]),
    lireLignes(tx, entrepriseId, [gte(ecritureComptable.dateEcriture, du), lte(ecritureComptable.dateEcriture, au)]),
  ]);
  return construireBalance(avant, periode);
}

/* ------------------------------- Journaux ------------------------------ */

export type JournalPeriode = { code: CodeJournal; libelle: string; lignes: LigneLivre[]; totalDebit: number; totalCredit: number };

/** Règle pure : classe les lignes par journal (toujours les quatre, dans le même ordre), chacune triée par date. */
export function construireJournaux(lignes: LigneLivre[]): JournalPeriode[] {
  return (["VT", "AC", "TR", "OD"] as const).map((code) => {
    const delaJournal = lignes.filter((l) => l.journal === code);
    return { code, libelle: LIBELLE_JOURNAL[code], lignes: delaJournal, totalDebit: delaJournal.reduce((s, l) => s + l.debit, 0), totalCredit: delaJournal.reduce((s, l) => s + l.credit, 0) };
  });
}

export async function lireJournaux(tx: TransactionDrizzle, entrepriseId: string, { du, au }: Periode): Promise<JournalPeriode[]> {
  const lignes = await lireLignes(tx, entrepriseId, [gte(ecritureComptable.dateEcriture, du), lte(ecritureComptable.dateEcriture, au)]);
  return construireJournaux(lignes);
}
