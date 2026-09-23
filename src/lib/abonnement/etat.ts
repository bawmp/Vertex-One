/**
 * Abonnement plat unique 50 000 FCFA/mois (2026-09-14) — logique pure de
 * l'état essai/actif/suspendu, isolée pour rester testable directement en
 * Vitest (pas de "server-only", même patron que src/lib/aangaraa/utilitaires.ts).
 *
 * Tout est recalculé depuis les deux dates à chaque appel, jamais par
 * transition incrémentale mutable — auto-réparant si un jour de vérification
 * planifiée est manqué (voir src/worker/tasks/traiter-abonnement-entreprise.ts).
 */
export type StatutAbonnement = "essai" | "actif" | "suspendu";
export type EvenementAbonnement = "ESSAI_J3" | "ESSAI_TERMINE" | "ECHEANCE_J3" | "ECHEANCE_DEPASSEE" | "SUSPENDU";

const GRACE_MS = 48 * 60 * 60 * 1000;
const RAPPEL_ANTICIPE_MS = 3 * 24 * 60 * 60 * 1000;
const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

export function calculerEtatAbonnement(
  entreprise: { essaiFinLe: Date; abonnementEcheanceLe: Date },
  maintenant: Date
): { statut: StatutAbonnement; evenement: EvenementAbonnement | null } {
  const { essaiFinLe, abonnementEcheanceLe } = entreprise;

  // Premier cycle : aucun paiement n'a encore jamais été confirmé (voir
  // genererLienPaiementAbonnement()/le webhook — abonnementEcheanceLe n'est
  // reculée qu'à la confirmation d'un paiement, jamais avant). Calculé AVANT le
  // test d'essai ci-dessous (2026-09-23, bug réel corrigé) : un paiement confirmé
  // PENDANT l'essai avance abonnementEcheanceLe au-delà d'essaiFinLe sans jamais
  // toucher essaiFinLe lui-même — sans ce garde-fou, `maintenant < essaiFinLe`
  // restait vrai jusqu'à la date de fin d'essai d'origine, et la vérification
  // planifiée quotidienne repassait chaque jour un abonnement pourtant déjà payé
  // en "essai" (et pouvait même renvoyer l'email ESSAI_J3 à quelqu'un qui venait
  // de payer).
  const premierCycle = abonnementEcheanceLe.getTime() === essaiFinLe.getTime();

  if (premierCycle && maintenant < essaiFinLe) {
    const resteMs = essaiFinLe.getTime() - maintenant.getTime();
    return { statut: "essai", evenement: resteMs <= RAPPEL_ANTICIPE_MS ? "ESSAI_J3" : null };
  }

  const finGrace = new Date(abonnementEcheanceLe.getTime() + GRACE_MS);

  if (maintenant > finGrace) {
    return { statut: "suspendu", evenement: "SUSPENDU" };
  }
  if (maintenant >= abonnementEcheanceLe) {
    return { statut: "actif", evenement: premierCycle ? "ESSAI_TERMINE" : "ECHEANCE_DEPASSEE" };
  }

  const resteMs = abonnementEcheanceLe.getTime() - maintenant.getTime();
  return { statut: "actif", evenement: resteMs <= RAPPEL_ANTICIPE_MS ? "ECHEANCE_J3" : null };
}

/**
 * Nouvelle échéance après un paiement confirmé — jamais avant aujourd'hui,
 * jamais avant l'échéance courante : payer en avance ne donne pas de jours
 * gratuits en plus de ce qui est dû, et payer en retard ne fait repartir le
 * cycle que depuis aujourd'hui, jamais depuis l'ancienne échéance dépassée.
 */
export function prochaineEcheanceApresPaiement(abonnementEcheanceLe: Date, maintenant: Date): Date {
  const base = maintenant.getTime() > abonnementEcheanceLe.getTime() ? maintenant : abonnementEcheanceLe;
  return new Date(base.getTime() + CYCLE_MS);
}
