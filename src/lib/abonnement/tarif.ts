/**
 * Tarifs de l'abonnement Vertex One (2026-10-31) — logique pure, sans "server-only", importable partout (actions serveur,
 * pages, site vitrine, Kyria) : une seule source pour tous les prix affichés ou facturés.
 *
 * - Prix mensuel plat, par entreprise, tous modules inclus, utilisateurs illimités.
 * - **Prix de lancement garanti** : toute entreprise créée jusqu'à OFFRE_LANCEMENT_JUSQU_AU garde le prix de lancement
 *   pendant GARANTIE_LANCEMENT_MOIS mois à partir de sa création, même si le prix standard monte entre-temps. La garantie se
 *   déduit de `entreprise.creeLe` : aucune colonne en plus, rien à migrer pour les entreprises déjà inscrites.
 * - **Formule annuelle** : 12 mois pour le prix de 10 (MOIS_OFFERTS_ANNUEL mois offerts) — un seul paiement Mobile Money au lieu
 *   de douze (moins d'occasions de décrocher, trésorerie d'avance).
 *
 * Pour changer le prix plus tard : modifier PRIX_MENSUEL_STANDARD seulement. Les entreprises sous garantie gardent
 * PRIX_MENSUEL_LANCEMENT jusqu'à la fin de leur garantie.
 */
export const PRIX_MENSUEL_LANCEMENT = 25_000;
export const PRIX_MENSUEL_STANDARD = 25_000;

/** Les entreprises créées jusqu'à cette date (31 mars 2027, 23 h 59 à Douala = 22 h 59 UTC) bénéficient de la garantie. */
export const OFFRE_LANCEMENT_JUSQU_AU = new Date("2027-03-31T22:59:59Z");
export const GARANTIE_LANCEMENT_MOIS = 12;
export const MOIS_OFFERTS_ANNUEL = 2;

export type FormuleAbonnement = "mensuel" | "annuel";

export type TarifAbonnement = {
  /** Prix mensuel appliqué à cette entreprise (lancement garanti ou standard). */
  prixMensuel: number;
  /** Montant d'un paiement mensuel : le prix mensuel. */
  montantMensuel: number;
  /** Montant d'un paiement annuel : 12 mois pour le prix de (12 − MOIS_OFFERTS_ANNUEL). */
  montantAnnuel: number;
  /** Mois couverts par le paiement annuel. */
  moisAnnuel: 12;
  /** Fin de la garantie de prix, ou null si l'entreprise n'en bénéficie pas (ou plus). */
  garantieJusquAu: Date | null;
};

function ajouterMois(date: Date, mois: number): Date {
  const resultat = new Date(date.getTime());
  resultat.setUTCMonth(resultat.getUTCMonth() + mois);
  return resultat;
}

/** Fin de la garantie de prix de lancement d'une entreprise créée à `creeLe`, ou null si elle n'y a pas droit. */
export function finGarantieLancement(creeLe: Date): Date | null {
  return creeLe.getTime() <= OFFRE_LANCEMENT_JUSQU_AU.getTime() ? ajouterMois(creeLe, GARANTIE_LANCEMENT_MOIS) : null;
}

/**
 * Tarif d'une entreprise à un instant donné. `prixStandard` et `prixLancement` ne sont paramétrables que pour tester le mécanisme
 * (garantie qui protège d'une hausse) ; le code applicatif n'appelle jamais avec autre chose que les valeurs par défaut.
 */
export function tarifPour(
  creeLeEntreprise: Date,
  maintenant: Date,
  prixStandard: number = PRIX_MENSUEL_STANDARD,
  prixLancement: number = PRIX_MENSUEL_LANCEMENT,
): TarifAbonnement {
  const fin = finGarantieLancement(creeLeEntreprise);
  const sousGarantie = fin !== null && maintenant.getTime() < fin.getTime();
  const prixMensuel = sousGarantie ? Math.min(prixLancement, prixStandard) : prixStandard;
  return {
    prixMensuel,
    montantMensuel: prixMensuel,
    montantAnnuel: prixMensuel * (12 - MOIS_OFFERTS_ANNUEL),
    moisAnnuel: 12,
    garantieJusquAu: sousGarantie ? fin : null,
  };
}

/** Montant et nombre de mois d'une formule, pour un tarif donné. Toute valeur inconnue retombe sur le mensuel (jamais cru tel quel du navigateur). */
export function montantEtMois(tarif: TarifAbonnement, formule: unknown): { montant: number; mois: 1 | 12; formule: FormuleAbonnement } {
  return formule === "annuel"
    ? { montant: tarif.montantAnnuel, mois: 12, formule: "annuel" }
    : { montant: tarif.montantMensuel, mois: 1, formule: "mensuel" };
}
