import type { LigneLivre } from "./livres";

/**
 * Fichier des écritures pour un autre logiciel de comptabilité (priorité 4.1). Trois présentations d'un même contenu :
 * « fec » (colonnes du fichier des écritures comptables, UTF-8), « sage » et « ciel » (texte à tabulations, jeu de caractères
 * ANSI, date JJMMAA, montants avec virgule décimale). Ce sont les colonnes courantes des assistants d'import ; chaque logiciel
 * se paramètre à l'import, un essai sur un petit fichier reste conseillé avant de tout charger.
 */
export type FormatLogiciel = "fec" | "sage" | "ciel";
export const FORMATS_LOGICIEL: FormatLogiciel[] = ["fec", "sage", "ciel"];

export function formatLogicielValide(v: unknown): v is FormatLogiciel {
  return typeof v === "string" && (FORMATS_LOGICIEL as string[]).includes(v);
}

export type LigneExport = { journal: string; date: Date; piece: string; compte: string; libelle: string; debit: number; credit: number; numero: number };

const deux = (n: number) => String(n).padStart(2, "0");

/** Date à l'heure de Douala (UTC+1, sans heure d'été), sous la forme { a, m, j }. */
function partiesDate(d: Date) {
  const l = new Date(d.getTime() + 3600_000);
  return { a: l.getUTCFullYear(), m: l.getUTCMonth() + 1, j: l.getUTCDate() };
}
export const dateJJMMAA = (d: Date) => { const { a, m, j } = partiesDate(d); return `${deux(j)}${deux(m)}${deux(a % 100)}`; };
export const dateAAAAMMJJ = (d: Date) => { const { a, m, j } = partiesDate(d); return `${a}${deux(m)}${deux(j)}`; };

/** Nettoie un libellé : une ligne, pas de tabulation ni de point-virgule, 60 caractères au plus. */
export function libelleExport(texte: string): string {
  return texte.replace(/[\t\r\n;]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Règle pure : numérote les pièces (une par document d'origine, dans l'ordre des dates, `VT00001`…) et les lignes. Une ligne sans
 * document d'origine forme sa propre pièce. Les lignes d'une même pièce gardent leur ordre.
 */
export function preparerLignesExport(lignes: LigneLivre[]): LigneExport[] {
  const pieces = new Map<string, string>();
  const compteurs = new Map<string, number>();
  return lignes.map((l, i) => {
    const cle = `${l.journal}|${l.piece ?? `ligne:${l.id}`}`;
    let piece = pieces.get(cle);
    if (!piece) {
      const n = (compteurs.get(l.journal) ?? 0) + 1;
      compteurs.set(l.journal, n);
      piece = `${l.journal}${String(n).padStart(5, "0")}`;
      pieces.set(cle, piece);
    }
    return { journal: l.journal, date: l.date, piece, compte: l.numeroCompte, libelle: libelleExport(l.libelle), debit: l.debit, credit: l.credit, numero: i + 1 };
  });
}

const virgule = (v: number) => String(v).replace(".", ",");

/** Montants toujours positifs (entiers FCFA), sans séparateur de milliers. */
export function texteEcritures(lignes: LigneExport[], format: FormatLogiciel): string {
  const SEP = format === "fec" ? ";" : "\t";
  const enTete =
    format === "fec"
      ? ["JournalCode", "EcritureNum", "EcritureDate", "CompteNum", "PieceRef", "EcritureLib", "Debit", "Credit"]
      : format === "sage"
        ? ["Journal", "Date", "Piece", "Compte", "Libelle", "Debit", "Credit"]
        : ["Numero", "Date", "Journal", "Compte", "Piece", "Libelle", "Montant", "Sens"];
  const corps = lignes.map((l) => {
    if (format === "fec") return [l.journal, l.piece, dateAAAAMMJJ(l.date), l.compte, l.piece, l.libelle, virgule(l.debit), virgule(l.credit)];
    if (format === "sage") return [l.journal, dateJJMMAA(l.date), l.piece, l.compte, l.libelle, virgule(l.debit), virgule(l.credit)];
    return [String(l.numero), dateJJMMAA(l.date), l.journal, l.compte, l.piece, l.libelle, virgule(l.debit > 0 ? l.debit : l.credit), l.debit > 0 ? "D" : "C"];
  });
  return [enTete, ...corps].map((c) => c.join(SEP)).join("\r\n") + "\r\n";
}

/** Encode en ANSI (Windows-1252 pour les accents courants) ; un caractère hors de ce jeu devient « ? ». */
export function versAnsi(texte: string): Buffer {
  const octets: number[] = [];
  for (const c of texte) {
    const p = c.codePointAt(0)!;
    if (p === 0x20ac) octets.push(0x80);
    else if (p === 0x2019) octets.push(0x27);
    else if (p < 256) octets.push(p);
    else octets.push(0x3f);
  }
  return Buffer.from(octets);
}

export function contenuExport(lignes: LigneLivre[], format: FormatLogiciel): { corps: Buffer; type: string; extension: string } {
  const texte = texteEcritures(preparerLignesExport(lignes), format);
  if (format === "fec") return { corps: Buffer.from(`﻿${texte}`, "utf-8"), type: "text/plain; charset=utf-8", extension: "txt" };
  return { corps: versAnsi(texte), type: "text/plain; charset=windows-1252", extension: "txt" };
}
