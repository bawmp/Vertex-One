/**
 * Lots et dates de péremption — règles pures (utilisables dans le navigateur). Les dates sont des jours « AAAA-MM-JJ » (heure de Douala) ;
 * les lots sont un découpage du stock d'un produit, jamais un second stock : la somme des lots ne dépasse jamais le stock du produit.
 */

export type StatutPeremption = "SANS_DATE" | "OK" | "BIENTOT" | "PERIME";

/** Nombre de jours avant la date à partir duquel un lot est signalé « bientôt périmé ». */
export const JOURS_ALERTE_PEREMPTION = 30;

const MS_JOUR = 86_400_000;

/** Jours entre deux dates AAAA-MM-JJ (négatif si `date` est passée). */
export function joursAvant(date: string, aujourdhui: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / MS_JOUR);
}

/** Périmé le lendemain de la date indiquée (un produit « à consommer avant le 10 » se vend encore le 10). */
export function statutPeremption(datePeremption: string | null, aujourdhui: string, joursAlerte: number = JOURS_ALERTE_PEREMPTION): StatutPeremption {
  if (!datePeremption) return "SANS_DATE";
  const jours = joursAvant(datePeremption, aujourdhui);
  if (jours < 0) return "PERIME";
  if (jours <= joursAlerte) return "BIENTOT";
  return "OK";
}

export type LotTri = { id: string; datePeremption: string | null; creeLe: Date; quantite: number };

/**
 * Ordre de sortie « premier périmé, premier sorti » (FEFO) : d'abord les lots non périmés, du plus proche de sa date au plus lointain,
 * ensuite les lots sans date (du plus ancien au plus récent), et les lots déjà périmés en dernier — on ne vend pas un périmé tant qu'il
 * reste autre chose.
 */
export function ordreFEFO<T extends LotTri>(lots: T[], aujourdhui: string): T[] {
  const rang = (l: T) => {
    const s = statutPeremption(l.datePeremption, aujourdhui);
    return s === "PERIME" ? 2 : s === "SANS_DATE" ? 1 : 0;
  };
  return [...lots].sort((a, b) => rang(a) - rang(b) || (a.datePeremption ?? "").localeCompare(b.datePeremption ?? "") || a.creeLe.getTime() - b.creeLe.getTime() || a.id.localeCompare(b.id));
}

/** Répartit une sortie de `quantite` sur les lots dans l'ordre FEFO ; `reste` est ce que les lots ne couvrent pas (pris sur le stock sans lot). */
export function repartirFEFO<T extends LotTri>(lots: T[], quantite: number, aujourdhui: string): { retraits: { lotId: string; quantite: number }[]; reste: number } {
  let aRetirer = Math.max(quantite, 0);
  const retraits: { lotId: string; quantite: number }[] = [];
  for (const lot of ordreFEFO(lots, aujourdhui)) {
    if (aRetirer <= 0) break;
    const pris = Math.min(lot.quantite, aRetirer);
    if (pris > 0) retraits.push({ lotId: lot.id, quantite: pris });
    aRetirer -= pris;
  }
  return { retraits, reste: aRetirer };
}

/**
 * Quand la somme des lots dépasse le stock (une sortie qui n'a pas touché aux lots), l'excédent se retire des lots dans l'ordre FEFO inversé
 * : on garde les lots qui se périment en dernier. Retourne les retraits à appliquer.
 */
export function exces(lots: LotTri[], stock: number, aujourdhui: string): { lotId: string; quantite: number }[] {
  const somme = lots.reduce((s, l) => s + l.quantite, 0);
  let aRetirer = somme - Math.max(stock, 0);
  if (aRetirer <= 0) return [];
  const retraits: { lotId: string; quantite: number }[] = [];
  for (const lot of [...ordreFEFO(lots, aujourdhui)].reverse()) {
    if (aRetirer <= 0) break;
    const pris = Math.min(lot.quantite, aRetirer);
    if (pris > 0) retraits.push({ lotId: lot.id, quantite: pris });
    aRetirer -= pris;
  }
  return retraits;
}
