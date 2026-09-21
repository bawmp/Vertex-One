/** Conversions de valeurs textuelles issues d'exports d'autres applications. Aucune ne lève : « valeur illisible » = null. */

/** Minuscules, sans accents, ponctuation et espaces multiples ramenés à un espace : sert à comparer des en-têtes et des libellés. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Nombre entier de francs CFA (pas de centimes) : « 15 000 », « 15000,00 », « 15,000.50 », « 15 000 FCFA ».
 * Le dernier séparateur suivi d'un à deux chiffres est décimal, sinon c'est un séparateur de milliers.
 */
export function montant(brut: string | undefined): number | null {
  if (brut === undefined) return null;
  let s = brut.replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;
  const dernier = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (dernier >= 0) {
    const apres = s.length - dernier - 1;
    if (apres >= 1 && apres <= 2) s = s.slice(0, dernier).replace(/[,.]/g, "") + "." + s.slice(dernier + 1);
    else s = s.replace(/[,.]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Nombre décimal (quantité, taux de TVA) : « 2 », « 2,5 », « 19.25 », « 19,25 % ». */
export function decimal(brut: string | undefined): number | null {
  if (brut === undefined) return null;
  const s = brut.replace(/[^\d,.\-]/g, "").replace(",", ".");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date : AAAA-MM-JJ (Asana, ISO), JJ/MM/AAAA (usage français, retenu quand c'est ambigu) et AAAA/MM/JJ, avec ou sans
 * heure. Renvoie midi UTC : un fuseau décalé ne fait ainsi jamais changer le jour affiché.
 */
export function date(brut: string | undefined): Date | null {
  const s = (brut ?? "").trim();
  if (!s) return null;
  let a: number, m: number, j: number;
  let f = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (f) {
    a = Number(f[1]);
    m = Number(f[2]);
    j = Number(f[3]);
  } else {
    f = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s].*)?$/.exec(s);
    if (!f) return null;
    j = Number(f[1]);
    m = Number(f[2]);
    a = Number(f[3]);
    // « 03/25/2026 » ne peut être que mois/jour : on le lit comme tel plutôt que de l'écarter.
    if (m > 12 && j <= 12) [j, m] = [m, j];
  }
  if (m < 1 || m > 12 || j < 1 || j > 31 || a < 1900 || a > 2200) return null;
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return d.getUTCMonth() === m - 1 ? d : null;
}

/** Oui/non des exports : « true », « yes », « oui », « 1 », « x ». */
export function booleen(brut: string | undefined): boolean {
  return ["true", "vrai", "yes", "oui", "1", "x", "y", "o"].includes(normaliser(brut ?? ""));
}
