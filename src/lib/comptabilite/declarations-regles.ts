/**
 * Déclarations fiscales : règles pures (priorité 4.8). Vertex One ne télédéclare pas : il rappelle l'échéance, garde le statut saisi
 * par l'entreprise et chiffre à titre indicatif l'impôt sur les sociétés. Aucun taux n'est « le bon » : l'entreprise saisit le sien.
 */
export const JOUR_ECHEANCE_TVA = 15; // au plus tard le 15 du mois qui suit la période

export const STATUTS_DECLARATION = ["A_FAIRE", "DECLAREE", "PAYEE"] as const;
export type StatutDeclaration = (typeof STATUTS_DECLARATION)[number];
export const periodeMoisValide = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Échéance de la TVA d'un mois « AAAA-MM » : le 15 du mois suivant. */
export function echeanceTva(periode: string): string | null {
  if (!periodeMoisValide(periode)) return null;
  const a = Number(periode.slice(0, 4));
  const mois = Number(periode.slice(5, 7));
  const [aa, mm] = mois === 12 ? [a + 1, 1] : [a, mois + 1];
  return `${aa}-${String(mm).padStart(2, "0")}-${String(JOUR_ECHEANCE_TVA).padStart(2, "0")}`;
}

/** Les `n` derniers mois entièrement écoulés (le plus récent d'abord) à partir d'un jour « AAAA-MM-JJ ». */
export function moisEcoules(aujourdhui: string, n: number): string[] {
  let a = Number(aujourdhui.slice(0, 4));
  let m = Number(aujourdhui.slice(5, 7)) - 1;
  const liste: string[] = [];
  for (let i = 0; i < n; i++) {
    if (m === 0) {
      m = 12;
      a -= 1;
    }
    liste.push(`${a}-${String(m).padStart(2, "0")}`);
    m -= 1;
  }
  return liste;
}

export type StatutAffiche = "A_FAIRE" | "EN_RETARD" | "DECLAREE" | "PAYEE";
/** Une déclaration non faite dont l'échéance est passée s'affiche « en retard » ; les autres gardent leur statut. */
export function statutAffiche(statut: string, echeance: string, aujourdhui: string): StatutAffiche {
  if (statut === "PAYEE") return "PAYEE";
  if (statut === "DECLAREE") return "DECLAREE";
  return echeance < aujourdhui ? "EN_RETARD" : "A_FAIRE";
}

export type EstimationIS = { impotSurResultat: number; minimum: number; impot: number; minimumApplique: boolean };
/**
 * Estimation indicative de l'impôt sur les sociétés : taux × résultat (jamais négatif), comparé à un minimum en pourcentage du chiffre
 * d'affaires ; on retient le plus élevé. Le résultat comptable tient lieu de résultat fiscal (aucune réintégration ni déduction).
 */
export function estimerIS(p: { resultat: number; chiffreAffaires: number; tauxPourcent: number; minimumPourcent: number }): EstimationIS {
  const impotSurResultat = Math.round((Math.max(0, p.resultat) * p.tauxPourcent) / 100);
  const minimum = Math.round((Math.max(0, p.chiffreAffaires) * p.minimumPourcent) / 100);
  return { impotSurResultat, minimum, impot: Math.max(impotSurResultat, minimum), minimumApplique: minimum > impotSurResultat };
}

/** « 33 » ou « 33,5 » devient 33.5 ; null hors de 0 à 100 avec deux décimales au plus. */
export function lirePourcentage(texte: string): number | null {
  const t = texte.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return v >= 0 && v <= 100 ? v : null;
}

export const montantDeclareValide = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000_000_000;
export const nettoyerReference = (v: string) => v.replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * Acomptes d'impôt sur les sociétés (mensuels) : on verse chaque mois un pourcentage du chiffre d'affaires hors taxe du mois, au plus
 * tard le 15 du mois suivant, puis on l'impute sur l'impôt de l'exercice. Le taux n'est jamais imposé par Vertex One : 2,2 % est
 * proposé (2 % + centimes additionnels), à confirmer par le comptable.
 */
export const TAUX_ACOMPTE_IS_DEFAUT = 2.2;
export const TYPE_ACOMPTE_IS = "ACOMPTE_IS";

/** Acompte d'un mois : taux × chiffre d'affaires HT du mois (jamais négatif), arrondi au franc. */
export function acompteMensuelIS(chiffreAffairesHT: number, tauxPourcent: number): number {
  return Math.round((Math.max(0, chiffreAffairesHT) * Math.max(0, tauxPourcent)) / 100);
}

/** Les douze mois « AAAA-MM » d'un exercice (numéro = année de fin) qui commence au mois `moisDebut`, du premier au dernier. */
export function moisDeExercice(annee: number, moisDebut: number): string[] {
  const liste: string[] = [];
  let a = moisDebut === 1 ? annee : annee - 1;
  let m = moisDebut;
  for (let i = 0; i < 12; i++) {
    liste.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
  }
  return liste;
}

export type BilanAcomptes = { verses: number; enAttente: number; soldeAPayer: number; creditAImputer: number };
/**
 * Bilan des acomptes d'un exercice face à l'impôt estimé : « versés » = acomptes notés payés (montant saisi, à défaut le montant
 * calculé), « en attente » = notés déclarés mais pas encore payés. Solde = impôt estimé − versés ; si les acomptes dépassent l'impôt,
 * l'excédent est un crédit à imputer, jamais un solde négatif.
 */
export function bilanAcomptes(impotEstime: number, acomptes: { statut: string; montant: number }[]): BilanAcomptes {
  const verses = acomptes.filter((a) => a.statut === "PAYEE").reduce((s, a) => s + a.montant, 0);
  const enAttente = acomptes.filter((a) => a.statut === "DECLAREE").reduce((s, a) => s + a.montant, 0);
  const net = impotEstime - verses;
  return { verses, enAttente, soldeAPayer: Math.max(0, net), creditAImputer: Math.max(0, -net) };
}
