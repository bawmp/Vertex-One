/**
 * Tarifs de l'abonnement Vertex One (2026-10-31) — logique pure, sans "server-only", importable partout (actions serveur,
 * pages, site vitrine, Kyria) : une seule source pour tous les prix affichés ou facturés.
 *
 * - Prix mensuel plat, par entreprise, tous modules inclus, utilisateurs illimités.
 * - **Palier équipe** : à partir de SEUIL_EQUIPE utilisateurs actifs, l'entreprise paie PRIX_MENSUEL_EQUIPE par mois POUR TOUTE
 *   L'ÉQUIPE (un prix fixe, jamais un prix par utilisateur). Le nombre d'utilisateurs est relu à chaque paiement, côté serveur :
 *   un paiement annuel déjà réglé n'est pas recalculé en cours d'année, le palier s'applique au renouvellement suivant.
 * - **Prix de lancement garanti** : toute entreprise créée jusqu'à OFFRE_LANCEMENT_JUSQU_AU garde le prix de lancement
 *   pendant GARANTIE_LANCEMENT_MOIS mois à partir de sa création, même si le prix standard monte entre-temps. La garantie se
 *   déduit de `entreprise.creeLe` : aucune colonne en plus. Elle ne protège que le palier de base : une entreprise qui atteint
 *   SEUIL_EQUIPE paie le prix du palier équipe (sa garantie ne s'applique plus tant qu'elle y est).
 * - **Formule annuelle** : 12 mois pour le prix de 10 (MOIS_OFFERTS_ANNUEL mois offerts) — un seul paiement Mobile Money au lieu
 *   de douze (moins d'occasions de décrocher, trésorerie d'avance).
 *
 * Pour changer le prix plus tard : modifier PRIX_MENSUEL_STANDARD (palier de base) ou PRIX_MENSUEL_EQUIPE. Les entreprises sous
 * garantie gardent PRIX_MENSUEL_LANCEMENT jusqu'à la fin de leur garantie.
 */
export const PRIX_MENSUEL_LANCEMENT = 25_000;
export const PRIX_MENSUEL_STANDARD = 25_000;

/** Palier équipe : à partir de ce nombre d'utilisateurs actifs, un prix fixe pour toute l'entreprise (décision de l'utilisateur, 2026-10-31). */
export const SEUIL_EQUIPE = 50;
export const PRIX_MENSUEL_EQUIPE = 45_000;

/** Les entreprises créées jusqu'à cette date (31 mars 2027, 23 h 59 à Douala = 22 h 59 UTC) bénéficient de la garantie. */
export const OFFRE_LANCEMENT_JUSQU_AU = new Date("2027-03-31T22:59:59Z");
export const GARANTIE_LANCEMENT_MOIS = 12;
export const MOIS_OFFERTS_ANNUEL = 2;

export type FormuleAbonnement = "mensuel" | "annuel";

export type TarifAbonnement = {
  /** Prix mensuel appliqué à cette entreprise (équipe, lancement garanti ou standard). */
  prixMensuel: number;
  /** Montant d'un paiement mensuel : le prix mensuel. */
  montantMensuel: number;
  /** Montant d'un paiement annuel : 12 mois pour le prix de (12 − MOIS_OFFERTS_ANNUEL). */
  montantAnnuel: number;
  /** Mois couverts par le paiement annuel. */
  moisAnnuel: 12;
  /** Fin de la garantie de prix, ou null si l'entreprise n'en bénéficie pas (ou plus, ou si elle est au palier équipe). */
  garantieJusquAu: Date | null;
  /** L'entreprise est-elle au palier équipe (SEUIL_EQUIPE utilisateurs actifs ou plus) ? */
  palierEquipe: boolean;
  /** Utilisateurs actifs pris en compte pour ce tarif. */
  utilisateursActifs: number;
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

/** Les paramètres de prix ne sont modifiables que pour tester le mécanisme ; le code applicatif n'appelle jamais avec autre chose que les valeurs par défaut. */
export type PrixConfigures = { standard?: number; lancement?: number; equipe?: number };

/**
 * Tarif d'une entreprise à un instant donné, pour un nombre d'utilisateurs actifs donné (0 quand on ne le connaît pas : tarif de base,
 * utilisé par le site vitrine pour le prix affiché à un visiteur).
 */
export function tarifPour(creeLeEntreprise: Date, maintenant: Date, utilisateursActifs = 0, prix: PrixConfigures = {}): TarifAbonnement {
  const standard = prix.standard ?? PRIX_MENSUEL_STANDARD;
  const lancement = prix.lancement ?? PRIX_MENSUEL_LANCEMENT;
  const equipe = prix.equipe ?? PRIX_MENSUEL_EQUIPE;

  const palierEquipe = utilisateursActifs >= SEUIL_EQUIPE;
  const fin = finGarantieLancement(creeLeEntreprise);
  const sousGarantie = !palierEquipe && fin !== null && maintenant.getTime() < fin.getTime();
  const prixMensuel = palierEquipe ? equipe : sousGarantie ? Math.min(lancement, standard) : standard;
  return {
    prixMensuel,
    montantMensuel: prixMensuel,
    montantAnnuel: prixMensuel * (12 - MOIS_OFFERTS_ANNUEL),
    moisAnnuel: 12,
    garantieJusquAu: sousGarantie ? fin : null,
    palierEquipe,
    utilisateursActifs,
  };
}

/** Montant et nombre de mois d'une formule, pour un tarif donné. Toute valeur inconnue retombe sur le mensuel (jamais cru tel quel du navigateur). */
export function montantEtMois(tarif: TarifAbonnement, formule: unknown): { montant: number; mois: 1 | 12; formule: FormuleAbonnement } {
  return formule === "annuel"
    ? { montant: tarif.montantAnnuel, mois: 12, formule: "annuel" }
    : { montant: tarif.montantMensuel, mois: 1, formule: "mensuel" };
}

/**
 * Frais de paiement Mobile Money à la charge du CLIENT (décision de l'utilisateur, 2026-11-06) : le prix de l'abonnement reste celui affiché
 * (25 000 FCFA…), le client règle en plus les frais d'ElyonPay pour que Vertex One reçoive exactement ce prix.
 *
 * Barème d'ElyonPay déduit de deux paiements réels du 2026-11-05 (100 FCFA → 97 reçus, 25 000 FCFA → 24 499 reçus) : 2 % + 1 FCFA. **Ce n'est pas un
 * tarif publié** : à confirmer avec ElyonPay, puis ajuster ces deux constantes. Le total est arrondi à l'entier supérieur : Vertex One reçoit au moins
 * le prix net, jamais moins.
 */
export const FRAIS_PAIEMENT_POURCENT = 2;
export const FRAIS_PAIEMENT_FIXE = 1;

/** Montant à faire payer pour que, frais d'ElyonPay déduits, il reste au moins `montantNet`. */
export function montantAvecFraisPaiement(montantNet: number): number {
  if (!Number.isFinite(montantNet) || montantNet <= 0) return 0;
  return Math.ceil((montantNet + FRAIS_PAIEMENT_FIXE) / (1 - FRAIS_PAIEMENT_POURCENT / 100));
}

/** Part des frais de paiement dans le total que règle le client. */
export function fraisPaiement(montantNet: number): number {
  return montantAvecFraisPaiement(montantNet) - montantNet;
}
