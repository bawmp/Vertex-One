import { m } from "@/lib/i18n/catalogue";

/**
 * Règles pures de la paie simple (primes + bulletin), utilisables dans le navigateur comme sur le serveur.
 * AUCUN calcul de cotisation sociale (CNPS) ni d'IRPP : les retenues sont saisies à la main par l'Administrateur (règle non négociable).
 */

export const TYPES_PRIME = [
  { cle: "RENDEMENT", libelle: m("Rendement") },
  { cle: "TRANSPORT", libelle: m("Transport") },
  { cle: "ANCIENNETE", libelle: m("Ancienneté") },
  { cle: "LOGEMENT", libelle: m("Logement") },
  { cle: "EXCEPTIONNELLE", libelle: m("Exceptionnelle") },
  { cle: "AUTRE", libelle: m("Autre") },
] as const;

export const MODES_PAIEMENT = [
  { cle: "VIREMENT", libelle: m("Virement bancaire") },
  { cle: "MOBILE_MONEY", libelle: m("Mobile Money") },
  { cle: "ESPECES", libelle: m("Espèces") },
  { cle: "CHEQUE", libelle: m("Chèque") },
] as const;

export const NB_MAX_RETENUES = 4;

export function libelleTypePrime(cle: string): string {
  return TYPES_PRIME.find((x) => x.cle === cle)?.libelle ?? cle;
}

export function libelleModePaiement(cle: string): string {
  return MODES_PAIEMENT.find((x) => x.cle === cle)?.libelle ?? cle;
}

/** « AAAA-MM » (mois de 01 à 12). */
export function moisValide(valeur: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur);
}

/** « AAAA-MM-JJ » qui existe vraiment au calendrier. */
export function jourValide(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

/** Mois en cours à l'heure de Douala (« AAAA-MM »). */
export function moisCourant(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(maintenant).slice(0, 7);
}

export function jourCourant(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(maintenant);
}

/** « 2026-11 » → « novembre 2026 » (langue demandée). */
export function libelleMois(mois: string, locale = "fr-FR"): string {
  if (!moisValide(mois)) return mois;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mois}-01T00:00:00Z`));
}

export type LigneRetenue = { libelle: string; montant: number };

/**
 * Total, retenues et net d'un bulletin. Les retenues sont celles écrites par l'Administrateur : jamais plus que ce qui est dû
 * (salaire de base + primes). Renvoie `null` à la place du net quand elles dépassent le brut.
 */
export function calculerBulletin(salaireBase: number, montantsPrimes: number[], retenues: LigneRetenue[]) {
  const totalPrimes = montantsPrimes.reduce((somme, x) => somme + x, 0);
  const totalRetenues = retenues.reduce((somme, x) => somme + x.montant, 0);
  const brut = salaireBase + totalPrimes;
  return { totalPrimes, totalRetenues, brut, net: totalRetenues > brut ? null : brut - totalRetenues };
}

/** Lit les lignes de retenue d'un formulaire (champs `retenueLibelle1..4` / `retenueMontant1..4`) ; une ligne vide est ignorée. */
export function lireRetenues(lire: (nom: string) => string): { retenues: LigneRetenue[]; erreur?: string } {
  const retenues: LigneRetenue[] = [];
  for (let i = 1; i <= NB_MAX_RETENUES; i++) {
    const libelle = lire(`retenueLibelle${i}`).trim().slice(0, 80);
    const brut = lire(`retenueMontant${i}`).trim().replace(/\s/g, "");
    if (!libelle && !brut) continue;
    const montant = Number(brut);
    if (!libelle) return { retenues, erreur: m("Donnez un nom à chaque retenue.") };
    if (!Number.isInteger(montant) || montant <= 0) return { retenues, erreur: m("Le montant d'une retenue doit être un nombre entier positif.") };
    retenues.push({ libelle, montant });
  }
  return { retenues };
}

/** Référence imprimée sur le bulletin : mois + fin de l'identifiant (stable, sans compteur à protéger). */
export function referenceBulletin(mois: string, id: string): string {
  return `BP-${mois}-${id.slice(-6).toUpperCase()}`;
}
