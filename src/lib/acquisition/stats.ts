/**
 * Indicateurs d'acquisition (2026-10-31) — logique PURE (aucune base, aucune horloge cachée : « maintenant » est un paramètre), pour que
 * chaque règle se teste directement. La lecture en base est dans src/lib/plateforme/acquisition.ts.
 *
 * Objectif du lancement : 10 clients payants en 90 jours. Vocabulaire :
 * - **payant** : une entreprise dont au moins un paiement d'abonnement a été CONFIRMÉ (jamais déduit du statut).
 * - **activée** : elle a émis sa première facture dans les 7 jours qui suivent son inscription (le signal qui prédit le mieux le paiement).
 * - **essai en cours** : non payante, avant la fin de son essai gratuit.
 */
export const OBJECTIF_PAYANTS = 10;
export const JOURS_ACTIVATION = 7;
const JOUR = 86_400_000;

export type LigneAcquisition = {
  id: string;
  nom: string;
  secteur: string;
  creeLe: Date;
  essaiFinLe: Date;
  echeanceLe: Date;
  origineSource: string | null;
  origineCampagne: string | null;
  origineParrain: string | null;
  adminNom: string | null;
  adminEmail: string | null;
  nbContacts: number;
  nbFactures: number;
  premiereFactureLe: Date | null;
  nbPaiementsClients: number;
  payant: boolean;
  dernierMontant: number | null;
  dernierMois: number | null;
};

export type Synthese = {
  total: number;
  inscrits7j: number;
  inscrits30j: number;
  essaisEnCours: number;
  payants: number;
  /** Revenu mensuel récurrent réel : dernier paiement confirmé ÷ mois couverts, pour les abonnements encore en cours. */
  mrr: number;
  /** Part des essais terminés (ou payés) qui sont devenus payants ; null tant qu'aucun essai n'est terminé. */
  conversionEssai: number | null;
  /** Entreprises inscrites depuis au moins 7 jours, et parmi elles celles qui ont émis une facture dans les 7 jours. */
  activation: { eligibles: number; activees: number; taux: number | null };
  objectif: { cible: number; atteint: number; reste: number };
};

const aActiveDansLesDelais = (l: LigneAcquisition) =>
  l.premiereFactureLe !== null && l.premiereFactureLe.getTime() - l.creeLe.getTime() <= JOURS_ACTIVATION * JOUR;

export function synthese(lignes: LigneAcquisition[], maintenant: Date): Synthese {
  const t = maintenant.getTime();
  const payants = lignes.filter((l) => l.payant);
  const nonPayantsTermines = lignes.filter((l) => !l.payant && l.essaiFinLe.getTime() <= t);
  const eligibles = lignes.filter((l) => t - l.creeLe.getTime() >= JOURS_ACTIVATION * JOUR);
  const activees = eligibles.filter(aActiveDansLesDelais);
  const mrr = payants
    .filter((l) => l.echeanceLe.getTime() >= t && l.dernierMontant !== null && l.dernierMois)
    .reduce((somme, l) => somme + Math.round(l.dernierMontant! / l.dernierMois!), 0);
  const denominateur = payants.length + nonPayantsTermines.length;
  return {
    total: lignes.length,
    inscrits7j: lignes.filter((l) => t - l.creeLe.getTime() < 7 * JOUR).length,
    inscrits30j: lignes.filter((l) => t - l.creeLe.getTime() < 30 * JOUR).length,
    essaisEnCours: lignes.filter((l) => !l.payant && l.essaiFinLe.getTime() > t).length,
    payants: payants.length,
    mrr,
    conversionEssai: denominateur === 0 ? null : payants.length / denominateur,
    activation: { eligibles: eligibles.length, activees: activees.length, taux: eligibles.length === 0 ? null : activees.length / eligibles.length },
    objectif: { cible: OBJECTIF_PAYANTS, atteint: payants.length, reste: Math.max(0, OBJECTIF_PAYANTS - payants.length) },
  };
}

export type LigneGroupe = { cle: string; inscrits: number; avecFacture: number; payants: number; tauxPayant: number | null };

function grouper(lignes: LigneAcquisition[], cle: (l: LigneAcquisition) => string): LigneGroupe[] {
  const groupes = new Map<string, LigneAcquisition[]>();
  for (const l of lignes) groupes.set(cle(l), [...(groupes.get(cle(l)) ?? []), l]);
  return [...groupes.entries()]
    .map(([k, ls]) => ({
      cle: k,
      inscrits: ls.length,
      avecFacture: ls.filter((l) => l.nbFactures > 0).length,
      payants: ls.filter((l) => l.payant).length,
      tauxPayant: ls.length === 0 ? null : ls.filter((l) => l.payant).length / ls.length,
    }))
    .sort((a, b) => b.payants - a.payants || b.inscrits - a.inscrits || a.cle.localeCompare(b.cle));
}

/** Les inscriptions d'avant le suivi d'origine n'ont pas de source : « inconnue », jamais « direct » (ce serait inventer). */
export const parOrigine = (lignes: LigneAcquisition[]) => grouper(lignes, (l) => l.origineSource ?? "inconnue");
export const parCampagne = (lignes: LigneAcquisition[]) =>
  grouper(lignes.filter((l) => l.origineCampagne), (l) => `${l.origineSource ?? "inconnue"} / ${l.origineCampagne}`);
export const parParrain = (lignes: LigneAcquisition[]) => grouper(lignes.filter((l) => l.origineParrain), (l) => l.origineParrain!);
export const parSecteur = (lignes: LigneAcquisition[]) => grouper(lignes, (l) => l.secteur);

export type EssaiARelancer = {
  id: string;
  nom: string;
  adminNom: string | null;
  adminEmail: string | null;
  secteur: string;
  origine: string;
  /** Jours écoulés depuis l'inscription (0 = le jour même). */
  jour: number;
  /** Jours restants avant la fin de l'essai (négatif = terminé). */
  joursRestants: number;
  etapes: { contacts: boolean; facture: boolean; paiementClient: boolean };
  action: string | null;
  /** 0 = le plus urgent. */
  priorite: number;
};

/**
 * La relance du jour pour chaque essai — le plan « jour 1 : importer, jour 3 : première facture, jour 7 : premier paiement Mobile Money,
 * avant la fin : conclure ». Les essais terminés depuis moins de 7 jours restent listés (à convertir). Une entreprise en bonne voie
 * (`action` nul) est listée en dernier : rien à faire pour elle aujourd'hui.
 */
export function essaisARelancer(lignes: LigneAcquisition[], maintenant: Date): EssaiARelancer[] {
  const t = maintenant.getTime();
  return lignes
    .filter((l) => !l.payant && t < l.essaiFinLe.getTime() + 7 * JOUR)
    .map((l) => {
      const jour = Math.floor((t - l.creeLe.getTime()) / JOUR);
      const joursRestants = Math.ceil((l.essaiFinLe.getTime() - t) / JOUR);
      let action: string | null = null;
      let priorite = 9;
      if (joursRestants <= 0) {
        action = "Essai terminé : proposer l'abonnement (formule annuelle : 2 mois offerts)";
        priorite = 0;
      } else if (l.nbContacts === 0 && jour >= 1) {
        action = "Jour 1 : l'aider à importer ou créer ses premiers contacts";
        priorite = 3;
      } else if (l.nbFactures === 0 && jour >= 3) {
        action = "Jour 3 : l'aider à émettre sa première facture";
        priorite = 2;
      } else if (l.nbFactures > 0 && l.nbPaiementsClients === 0 && jour >= 7) {
        action = "Jour 7 : lui montrer le paiement Mobile Money d'un client";
        priorite = 1;
      } else if (joursRestants <= 3) {
        action = "Essai bientôt fini : conclure et proposer l'abonnement";
        priorite = 1;
      }
      return {
        id: l.id,
        nom: l.nom,
        adminNom: l.adminNom,
        adminEmail: l.adminEmail,
        secteur: l.secteur,
        origine: l.origineSource ?? "inconnue",
        jour,
        joursRestants,
        etapes: { contacts: l.nbContacts > 0, facture: l.nbFactures > 0, paiementClient: l.nbPaiementsClients > 0 },
        action,
        priorite,
      };
    })
    .sort((a, b) => a.priorite - b.priorite || b.jour - a.jour);
}
