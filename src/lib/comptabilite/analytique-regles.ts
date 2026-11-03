import { m } from "@/lib/i18n/catalogue";

export const AXES = ["PROJET", "AGENCE", "AUTRE"] as const;
export type Axe = (typeof AXES)[number];
export const LIBELLES_AXE: Record<Axe, string> = { PROJET: m("Projet"), AGENCE: m("Agence"), AUTRE: m("Autre") };

export function axeValide(v: unknown): v is Axe {
  return typeof v === "string" && (AXES as readonly string[]).includes(v);
}

/** Code court de la section : lettres, chiffres, tiret ou souligné, 2 à 20 caractères, toujours en majuscules. */
export function normaliserCode(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "-");
}
export function codeValide(v: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(v);
}
export function nettoyerLibelle(v: string): string {
  return v.replace(/\s+/g, " ").trim().slice(0, 80);
}

export type LigneResultat = { section: string | null; classe: number; debit: number; credit: number };
export type ResultatSection = { section: string | null; produits: number; charges: number; resultat: number };

/**
 * Règle pure : produits (classe 7, crédit − débit), charges (classe 6, débit − crédit) et résultat par section. Les lignes sans section
 * forment « Non affecté » (`section: null`) : la somme de toutes les lignes retrouve toujours le résultat de l'entreprise.
 */
export function resultatParSection(lignes: LigneResultat[]): ResultatSection[] {
  const par = new Map<string | null, ResultatSection>();
  for (const l of lignes) {
    if (l.classe !== 6 && l.classe !== 7) continue;
    const r = par.get(l.section) ?? { section: l.section, produits: 0, charges: 0, resultat: 0 };
    if (l.classe === 7) r.produits += l.credit - l.debit;
    else r.charges += l.debit - l.credit;
    r.resultat = r.produits - r.charges;
    par.set(l.section, r);
  }
  return [...par.values()].sort((a, b) => (a.section === null ? 1 : b.section === null ? -1 : b.resultat - a.resultat));
}
