/**
 * Classement des devis et des factures dans les listes : par période (mois, trimestre, semestre, année) et par statut.
 * Règles pures, utilisables dans le navigateur. Le jour civil est celui de Douala (UTC+1, sans heure d'été) : un document émis
 * le 31 à 23 h 30 appartient bien au mois qui se termine.
 */

export type Granularite = "MOIS" | "TRIMESTRE" | "SEMESTRE" | "ANNEE";

export type Periode = {
  /** Clé triable (« 2026-11 », « 2026-T4 », « 2026-S2 », « 2026 »). */
  cle: string;
  annee: number;
  /** Mois 1-12, trimestre 1-4, semestre 1-2 ; 0 pour une année. */
  indice: number;
  granularite: Granularite;
};

const DECALAGE_DOUALA_MS = 3600_000;

export function periodeDe(date: Date | string, granularite: Granularite): Periode {
  const d = new Date(new Date(date).getTime() + DECALAGE_DOUALA_MS);
  const annee = d.getUTCFullYear();
  const mois = d.getUTCMonth() + 1;
  if (granularite === "MOIS") return { cle: `${annee}-${String(mois).padStart(2, "0")}`, annee, indice: mois, granularite };
  if (granularite === "TRIMESTRE") {
    const q = Math.ceil(mois / 3);
    return { cle: `${annee}-T${q}`, annee, indice: q, granularite };
  }
  if (granularite === "SEMESTRE") {
    const s = mois <= 6 ? 1 : 2;
    return { cle: `${annee}-S${s}`, annee, indice: s, granularite };
  }
  return { cle: String(annee), annee, indice: 0, granularite };
}

export type GroupePeriode<T> = { periode: Periode; elements: T[] };

/** Regroupe par période, la plus récente d'abord ; l'ordre des éléments (déjà trié par l'appelant) est conservé dans chaque groupe. */
export function grouperParPeriode<T>(elements: T[], dateDe: (e: T) => Date | string, granularite: Granularite): GroupePeriode<T>[] {
  const groupes = new Map<string, GroupePeriode<T>>();
  for (const e of elements) {
    const periode = periodeDe(dateDe(e), granularite);
    const g = groupes.get(periode.cle) ?? { periode, elements: [] };
    g.elements.push(e);
    groupes.set(periode.cle, g);
  }
  return [...groupes.values()].sort((a, b) => (a.periode.cle < b.periode.cle ? 1 : a.periode.cle > b.periode.cle ? -1 : 0));
}

// ===== Statuts =====

export type FiltreFacture = "TOUTES" | "NON_PAYEES" | "EN_ATTENTE" | "EN_RETARD" | "PAYEES" | "ANNULEES";
export type FiltreDevis = "TOUS" | "BROUILLON" | "EN_ATTENTE" | "ACCEPTE" | "REFUSE" | "EXPIRE";

/** « Non payées » = tout ce qui reste à encaisser ; « en attente » = pas encore en retard (émise ou partiellement payée). */
export function factureCorrespond(statut: string, filtre: FiltreFacture): boolean {
  switch (filtre) {
    case "TOUTES":
      return true;
    case "NON_PAYEES":
      return statut === "EMISE" || statut === "PARTIELLEMENT_PAYEE" || statut === "EN_RETARD";
    case "EN_ATTENTE":
      return statut === "EMISE" || statut === "PARTIELLEMENT_PAYEE";
    case "EN_RETARD":
      return statut === "EN_RETARD";
    case "PAYEES":
      return statut === "PAYEE";
    case "ANNULEES":
      return statut === "ANNULEE";
  }
}

/** Un devis envoyé dont la date de validité est passée est « expiré » (même si son statut en base n'a pas encore bougé). */
export function devisCorrespond(devis: { statut: string; dateValidite: Date | string }, filtre: FiltreDevis, maintenant: Date = new Date()): boolean {
  const echu = devis.statut === "EXPIRE" || (devis.statut === "ENVOYE" && new Date(devis.dateValidite) < maintenant);
  switch (filtre) {
    case "TOUS":
      return true;
    case "BROUILLON":
      return devis.statut === "BROUILLON";
    case "EN_ATTENTE":
      return devis.statut === "ENVOYE" && !echu;
    case "ACCEPTE":
      return devis.statut === "ACCEPTE";
    case "REFUSE":
      return devis.statut === "REFUSE";
    case "EXPIRE":
      return echu;
  }
}

/** Montant à compter dans le total d'un groupe : une facture annulée et un devis refusé n'y entrent pas. */
export function compteDansTotal(statut: string): boolean {
  return statut !== "ANNULEE" && statut !== "REFUSE";
}
