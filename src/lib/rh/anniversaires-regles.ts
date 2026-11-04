/**
 * Anniversaires des collaborateurs : règles pures (fiche collaborateur, 2026-11-04). Dates au format « AAAA-MM-JJ » (jour civil,
 * sans heure : un anniversaire ne dépend pas du fuseau). Le 29 février se fête le 28 février les années non bissextiles.
 */
export const AGE_MIN = 14;
export const AGE_MAX = 100;

const bissextile = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const deux = (n: number) => String(n).padStart(2, "0");

/** « AAAA-MM-JJ » réel (refuse le 31 février) ; renvoie ses parties ou null. */
export function lireJour(texte: string): { a: number; m: number; j: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) return null;
  const [a, m, j] = texte.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? { a, m, j } : null;
}

/** Âge en années révolues à une date. */
export function ageAu(naissance: string, jour: string): number | null {
  const n = lireJour(naissance);
  const p = lireJour(jour);
  if (!n || !p) return null;
  return p.a - n.a - (p.m < n.m || (p.m === n.m && p.j < n.j) ? 1 : 0);
}

/** Date de naissance acceptable : réelle, pas dans le futur, âge entre 14 et 100 ans. Renvoie un message d'erreur, ou null si valide. */
export function erreurDateNaissance(naissance: string, aujourdhui: string): string | null {
  if (!lireJour(naissance)) return "La date de naissance n'est pas valide.";
  if (naissance > aujourdhui) return "La date de naissance ne peut pas être dans le futur.";
  const age = ageAu(naissance, aujourdhui);
  if (age === null || age < AGE_MIN || age > AGE_MAX) return `L'âge doit être compris entre ${AGE_MIN} et ${AGE_MAX} ans.`;
  return null;
}

/** Jour où l'anniversaire tombe une année donnée (28 février si né un 29 février et que l'année n'est pas bissextile). */
export function jourAnniversaire(naissance: string, annee: number): string | null {
  const n = lireJour(naissance);
  if (!n) return null;
  const j = n.m === 2 && n.j === 29 && !bissextile(annee) ? 28 : n.j;
  return `${annee}-${deux(n.m)}-${deux(j)}`;
}

const jourEnNombre = (texte: string) => {
  const p = lireJour(texte)!;
  return Math.round(Date.UTC(p.a, p.m - 1, p.j) / 86_400_000);
};

export type ProchainAnniversaire = { date: string; jours: number; age: number };

/** Prochain anniversaire à partir d'aujourd'hui (aujourd'hui compris : `jours` vaut 0 le jour même) et âge qui sera atteint. */
export function prochainAnniversaire(naissance: string, aujourdhui: string): ProchainAnniversaire | null {
  const n = lireJour(naissance);
  const t = lireJour(aujourdhui);
  if (!n || !t) return null;
  let date = jourAnniversaire(naissance, t.a)!;
  if (date < aujourdhui) date = jourAnniversaire(naissance, t.a + 1)!;
  const annee = Number(date.slice(0, 4));
  return { date, jours: jourEnNombre(date) - jourEnNombre(aujourdhui), age: annee - n.a };
}

export type PersonneAnniversaire = { type: "UTILISATEUR" | "STAGIAIRE"; id: string; nom: string; naissance: string };
export type AnniversaireProche = PersonneAnniversaire & ProchainAnniversaire;

/** Les anniversaires des `fenetre` prochains jours (aujourd'hui compris), du plus proche au plus lointain, puis par nom. */
export function anniversairesProches(personnes: PersonneAnniversaire[], aujourdhui: string, fenetre: number): AnniversaireProche[] {
  const liste: AnniversaireProche[] = [];
  for (const p of personnes) {
    const prochain = prochainAnniversaire(p.naissance, aujourdhui);
    if (prochain && prochain.jours <= fenetre) liste.push({ ...p, ...prochain });
  }
  return liste.sort((a, b) => a.jours - b.jours || a.nom.localeCompare(b.nom, "fr"));
}

export function libelleDelai(jours: number): string {
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  return `Dans ${jours} jours`;
}
