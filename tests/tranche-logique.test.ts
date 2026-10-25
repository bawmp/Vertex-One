import { describe, test, expect } from "vitest";
import { calculerSolde, determinerMontantTranche, statutApresReglement, trancheMinimale, TRANCHE_MINIMUM } from "@/lib/facturation/tranche";

/** Règles du paiement en plusieurs fois : pures, donc testées sans base. */
describe("solde d'une facture", () => {
  test("le solde est le montant moins les règlements, jamais négatif", () => {
    expect(calculerSolde(11925, [])).toEqual({ paye: 0, solde: 11925 });
    expect(calculerSolde(11925, [{ montant: 5000 }, { montant: 2000 }])).toEqual({ paye: 7000, solde: 4925 });
    expect(calculerSolde(11925, [{ montant: 20000 }])).toEqual({ paye: 20000, solde: 0 });
  });
});

describe("tranche minimale", () => {
  test("1 000 FCFA, ou le solde entier quand il est plus petit", () => {
    expect(trancheMinimale(50_000)).toBe(TRANCHE_MINIMUM);
    expect(trancheMinimale(600)).toBe(600);
  });
});

describe("montant d'une tentative de paiement", () => {
  const base = { solde: 11925, reserve: 0, tranchesAutorisees: true };

  test("sans montant demandé : tout le solde disponible", () => {
    expect(determinerMontantTranche({ ...base, montantDemande: undefined })).toEqual({ montant: 11925 });
    expect(determinerMontantTranche({ ...base, reserve: 4000, montantDemande: undefined })).toEqual({ montant: 7925 });
  });

  test("une tranche valide est acceptée telle quelle", () => {
    expect(determinerMontantTranche({ ...base, montantDemande: 5000 })).toEqual({ montant: 5000 });
    expect(determinerMontantTranche({ ...base, montantDemande: 1000 })).toEqual({ montant: 1000 });
    expect(determinerMontantTranche({ ...base, montantDemande: 11925 })).toEqual({ montant: 11925 });
  });

  test("jamais plus que le solde, jamais fractionnaire, nul, négatif ni d'un autre type", () => {
    for (const mauvais of [11926, 1_000_000, 1000.5, 0, -500, "5000", NaN, Infinity, {}, true]) {
      expect(determinerMontantTranche({ ...base, montantDemande: mauvais }), String(mauvais)).toHaveProperty("erreur");
    }
  });

  test("une tranche dérisoire est refusée", () => {
    expect(determinerMontantTranche({ ...base, montantDemande: 999 })).toHaveProperty("erreur");
    expect(determinerMontantTranche({ ...base, montantDemande: 1 })).toHaveProperty("erreur");
  });

  test("ce que d'autres tentatives en attente ont réservé n'est plus disponible", () => {
    expect(determinerMontantTranche({ ...base, reserve: 8000, montantDemande: 5000 })).toHaveProperty("erreur");
    expect(determinerMontantTranche({ ...base, reserve: 8000, montantDemande: 3925 })).toEqual({ montant: 3925 });
    expect(determinerMontantTranche({ ...base, reserve: 11925, montantDemande: undefined })).toHaveProperty("erreur");
  });

  test("tranches désactivées : seul le solde entier est accepté", () => {
    expect(determinerMontantTranche({ ...base, tranchesAutorisees: false, montantDemande: 5000 })).toHaveProperty("erreur");
    expect(determinerMontantTranche({ ...base, tranchesAutorisees: false, montantDemande: 11925 })).toEqual({ montant: 11925 });
    expect(determinerMontantTranche({ ...base, tranchesAutorisees: false, montantDemande: undefined })).toEqual({ montant: 11925 });
  });

  test("un solde plus petit que la tranche minimale se paie en entier", () => {
    expect(determinerMontantTranche({ solde: 600, reserve: 0, tranchesAutorisees: true, montantDemande: 600 })).toEqual({ montant: 600 });
    expect(determinerMontantTranche({ solde: 600, reserve: 0, tranchesAutorisees: true, montantDemande: 300 })).toHaveProperty("erreur");
  });
});

describe("statut après un règlement", () => {
  test("payée dès que le total atteint le montant, sinon partiellement payée", () => {
    expect(statutApresReglement("EMISE", 11925, 11925)).toBe("PAYEE");
    expect(statutApresReglement("EMISE", 11925, 12000)).toBe("PAYEE"); // trop-perçu : la facture est soldée
    expect(statutApresReglement("EMISE", 11925, 5000)).toBe("PARTIELLEMENT_PAYEE");
    expect(statutApresReglement("PARTIELLEMENT_PAYEE", 11925, 8000)).toBe("PARTIELLEMENT_PAYEE");
  });

  test("une facture déjà en retard le reste tant qu'elle n'est pas soldée", () => {
    expect(statutApresReglement("EN_RETARD", 11925, 5000)).toBe("EN_RETARD");
    expect(statutApresReglement("EN_RETARD", 11925, 11925)).toBe("PAYEE");
  });
});
