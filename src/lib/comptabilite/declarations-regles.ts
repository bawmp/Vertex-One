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
