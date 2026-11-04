import { m } from "@/lib/i18n/catalogue";

/** Les cinq régularisations de fin d'exercice proposées, avec le compte de bilan qu'elles utilisent. */
export type TypeRegularisation = "CHARGE_A_PAYER" | "PRODUIT_A_RECEVOIR" | "CHARGE_CONSTATEE_AVANCE" | "PRODUIT_CONSTATE_AVANCE" | "PROVISION";

export type DefinitionRegularisation = {
  type: TypeRegularisation;
  titre: string;
  explication: string;
  /** Classe du compte de gestion choisi par la personne (6 charge, 7 produit) ; null : compte fixe. */
  classeCompte: 6 | 7 | null;
  compteBilan: string;
  /** Une extourne au 1er janvier suivant n'a de sens que pour ce qui se dénoue avec la facture ou l'exercice suivant. */
  extourne: boolean;
};

export const REGULARISATIONS: DefinitionRegularisation[] = [
  {
    type: "CHARGE_A_PAYER",
    titre: m("Charge à payer"),
    explication: m("Un service reçu ou une marchandise livrée cette année, dont la facture n'est pas encore arrivée (électricité, loyer, honoraires…)."),
    classeCompte: 6,
    compteBilan: "408000",
    extourne: true,
  },
  {
    type: "PRODUIT_A_RECEVOIR",
    titre: m("Produit à recevoir"),
    explication: m("Une prestation réalisée cette année que vous n'avez pas encore facturée au client."),
    classeCompte: 7,
    compteBilan: "418000",
    extourne: true,
  },
  {
    type: "CHARGE_CONSTATEE_AVANCE",
    titre: m("Charge constatée d'avance"),
    explication: m("Une dépense déjà payée qui concerne l'année suivante (assurance, loyer d'avance…) : elle sort des charges de cette année."),
    classeCompte: 6,
    compteBilan: "476000",
    extourne: true,
  },
  {
    type: "PRODUIT_CONSTATE_AVANCE",
    titre: m("Produit constaté d'avance"),
    explication: m("Un encaissement ou une facture qui concerne l'année suivante (abonnement payé d'avance…) : il sort du chiffre d'affaires de cette année."),
    classeCompte: 7,
    compteBilan: "477000",
    extourne: true,
  },
  {
    type: "PROVISION",
    titre: m("Provision pour risques"),
    explication: m("Une perte probable mais pas encore certaine (litige, garantie…) : une charge est constatée aujourd'hui, la provision reste au bilan."),
    classeCompte: null,
    compteBilan: "191000",
    extourne: false,
  },
];

export function definitionRegularisation(type: string): DefinitionRegularisation | undefined {
  return REGULARISATIONS.find((d) => d.type === type);
}

export type LigneRegularisation = { numero: string; debit: number; credit: number };

/**
 * Règle pure : les deux lignes de l'écriture de régularisation. `compteGestion` est le compte de charge ou de produit choisi (ignoré pour
 * une provision, toujours 691000 / 191000). L'extourne est le miroir exact (débit et crédit échangés).
 */
export function lignesRegularisation(type: TypeRegularisation, montant: number, compteGestion: string | null): LigneRegularisation[] | null {
  if (!Number.isInteger(montant) || montant <= 0) return null;
  switch (type) {
    case "CHARGE_A_PAYER":
      return compteGestion ? [{ numero: compteGestion, debit: montant, credit: 0 }, { numero: "408000", debit: 0, credit: montant }] : null;
    case "PRODUIT_A_RECEVOIR":
      return compteGestion ? [{ numero: "418000", debit: montant, credit: 0 }, { numero: compteGestion, debit: 0, credit: montant }] : null;
    case "CHARGE_CONSTATEE_AVANCE":
      return compteGestion ? [{ numero: "476000", debit: montant, credit: 0 }, { numero: compteGestion, debit: 0, credit: montant }] : null;
    case "PRODUIT_CONSTATE_AVANCE":
      return compteGestion ? [{ numero: compteGestion, debit: montant, credit: 0 }, { numero: "477000", debit: 0, credit: montant }] : null;
    case "PROVISION":
      return [{ numero: "691000", debit: montant, credit: 0 }, { numero: "191000", debit: 0, credit: montant }];
  }
}

export function lignesExtourne(lignes: LigneRegularisation[]): LigneRegularisation[] {
  return lignes.map((l) => ({ numero: l.numero, debit: l.credit, credit: l.debit }));
}

/**
 * Premier jour de l'exercice qui suit la date donnée (heure de Douala) : la date de la reprise (extourne) d'une régularisation.
 * `moisDebut` est le premier mois de l'exercice (1 = année civile, donc le 1er janvier suivant).
 */
export function debutExerciceSuivant(date: Date, moisDebut = 1): Date {
  const [annee, mois] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Douala" }).format(date).split("-").map(Number);
  const anneeDuDebut = moisDebut === 1 ? annee + 1 : mois >= moisDebut ? annee + 1 : annee;
  return new Date(`${anneeDuDebut}-${String(moisDebut).padStart(2, "0")}-01T00:00:00.000+01:00`);
}

/** Année civile : le 1er janvier qui suit (cas général, conservé pour les appels existants). */
export function premierJanvierSuivant(date: Date): Date {
  return debutExerciceSuivant(date, 1);
}
