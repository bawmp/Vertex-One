import { describe, test, expect } from "vitest";
import { calculerEtatAbonnement, prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";

const JOUR_MS = 24 * 60 * 60 * 1000;
const HEURE_MS = 60 * 60 * 1000;

/**
 * Abonnement plat unique 50 000 FCFA/mois (2026-09-14) — logique pure, pas de
 * base de données requise. Une assertion par ligne de la table d'états
 * documentée dans src/lib/abonnement/etat.ts.
 */
describe("Abonnement — calculerEtatAbonnement()", () => {
  test("en essai, plus de 3 jours restants : aucun rappel", () => {
    const maintenant = new Date("2026-01-01T00:00:00Z");
    const essaiFinLe = new Date(maintenant.getTime() + 10 * JOUR_MS);
    const abonnementEcheanceLe = essaiFinLe;
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "essai", evenement: null });
  });

  test("en essai, 3 jours ou moins restants : rappel ESSAI_J3", () => {
    const maintenant = new Date("2026-01-01T00:00:00Z");
    const essaiFinLe = new Date(maintenant.getTime() + 3 * JOUR_MS);
    const abonnementEcheanceLe = essaiFinLe;
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "essai", evenement: "ESSAI_J3" });
  });

  test("essai tout juste terminé, aucun paiement confirmé (premier cycle) : ESSAI_TERMINE", () => {
    const maintenant = new Date("2026-01-15T00:00:00Z");
    const essaiFinLe = new Date("2026-01-14T00:00:00Z");
    const abonnementEcheanceLe = essaiFinLe; // jamais reculée : aucun paiement confirmé
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "actif", evenement: "ESSAI_TERMINE" });
  });

  test("cycle payant, plus de 3 jours avant l'échéance : aucun rappel", () => {
    const maintenant = new Date("2026-02-01T00:00:00Z");
    const essaiFinLe = new Date("2026-01-01T00:00:00Z");
    const abonnementEcheanceLe = new Date(maintenant.getTime() + 10 * JOUR_MS); // reculée par un paiement confirmé
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "actif", evenement: null });
  });

  test("cycle payant, 3 jours ou moins avant l'échéance : ECHEANCE_J3", () => {
    const maintenant = new Date("2026-02-01T00:00:00Z");
    const essaiFinLe = new Date("2026-01-01T00:00:00Z");
    const abonnementEcheanceLe = new Date(maintenant.getTime() + 3 * JOUR_MS);
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "actif", evenement: "ECHEANCE_J3" });
  });

  test("échéance dépassée mais dans la grâce de 48h (cycle payant) : ECHEANCE_DEPASSEE", () => {
    const maintenant = new Date("2026-02-01T10:00:00Z");
    const essaiFinLe = new Date("2026-01-01T00:00:00Z");
    const abonnementEcheanceLe = new Date(maintenant.getTime() - 10 * HEURE_MS); // dépassée depuis 10h, grâce = 48h
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "actif", evenement: "ECHEANCE_DEPASSEE" });
  });

  test("exactement à la limite de la grâce (48h pile) : encore actif", () => {
    const abonnementEcheanceLe = new Date("2026-02-01T00:00:00Z");
    const maintenant = new Date(abonnementEcheanceLe.getTime() + 48 * HEURE_MS);
    expect(calculerEtatAbonnement({ essaiFinLe: new Date("2026-01-01T00:00:00Z"), abonnementEcheanceLe }, maintenant).statut).toBe("actif");
  });

  test("grâce dépassée (cycle payant) : suspendu", () => {
    const maintenant = new Date("2026-02-05T00:00:00Z");
    const essaiFinLe = new Date("2026-01-01T00:00:00Z");
    const abonnementEcheanceLe = new Date(maintenant.getTime() - 3 * JOUR_MS); // 3 jours de retard, grâce de 48h dépassée
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "suspendu", evenement: "SUSPENDU" });
  });

  test("grâce dépassée dès le premier cycle (jamais payé après l'essai) : suspendu", () => {
    const maintenant = new Date("2026-01-20T00:00:00Z");
    const essaiFinLe = new Date("2026-01-14T00:00:00Z"); // essai fini il y a 6 jours, bien au-delà des 48h de grâce
    const abonnementEcheanceLe = essaiFinLe;
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, maintenant)).toEqual({ statut: "suspendu", evenement: "SUSPENDU" });
  });

  test("le même jour ne change jamais de phase — idempotence pour dernierRappelAbonnementEnvoye", () => {
    const essaiFinLe = new Date("2026-01-14T00:00:00Z");
    const abonnementEcheanceLe = essaiFinLe;
    const matin = new Date("2026-01-12T08:00:00Z");
    const soir = new Date("2026-01-12T20:00:00Z");
    expect(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, matin)).toEqual(calculerEtatAbonnement({ essaiFinLe, abonnementEcheanceLe }, soir));
  });
});

describe("Abonnement — prochaineEcheanceApresPaiement()", () => {
  test("payer en avance : l'échéance repart de l'ancienne échéance, pas d'aujourd'hui", () => {
    const abonnementEcheanceLe = new Date("2026-02-01T00:00:00Z");
    const maintenant = new Date("2026-01-25T00:00:00Z"); // paie 7 jours avant l'échéance
    expect(prochaineEcheanceApresPaiement(abonnementEcheanceLe, maintenant)).toEqual(new Date(abonnementEcheanceLe.getTime() + 30 * JOUR_MS));
  });

  test("payer en retard : l'échéance repart d'aujourd'hui, jamais de l'ancienne échéance dépassée", () => {
    const abonnementEcheanceLe = new Date("2026-02-01T00:00:00Z");
    const maintenant = new Date("2026-02-10T00:00:00Z"); // 9 jours de retard
    expect(prochaineEcheanceApresPaiement(abonnementEcheanceLe, maintenant)).toEqual(new Date(maintenant.getTime() + 30 * JOUR_MS));
  });
});
