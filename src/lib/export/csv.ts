/**
 * Écriture d'un CSV lisible par Excel (français) ET relisible par l'assistant d'import (src/lib/import/csv.ts) :
 * séparateur « ; », UTF-8 avec BOM (sans lui Excel casse les accents), fins de ligne CRLF, cellules entre guillemets
 * quand elles contiennent un séparateur, un guillemet ou un saut de ligne.
 *
 * Sécurité (injection de formule) : un tableur exécute une cellule qui commence par = + - @ (ou une tabulation). Un
 * client, une note ou un nom saisi par un tiers pourrait donc piéger le fichier exporté. Ces cellules sont préfixées d'une
 * apostrophe, SAUF un numéro de téléphone ou un nombre (« +237 690 11 12 22 », « -500 ») qui ne peut rien exécuter. L'import
 * retire cette apostrophe (voir `appliquerCorrespondance`), donc rien ne se perd à l'aller-retour.
 */
const DECLENCHEURS = /^[=+\-@\t\r]/;
const NOMBRE_OU_TELEPHONE = /^[+-]?[\d\s().,-]*\d[\d\s().,-]*$/;

export function neutraliserFormule(cellule: string): string {
  return DECLENCHEURS.test(cellule) && !NOMBRE_OU_TELEPHONE.test(cellule) ? `'${cellule}` : cellule;
}

function echapper(cellule: string): string {
  const sure = neutraliserFormule(cellule);
  return /[";\r\n]/.test(sure) ? `"${sure.replace(/"/g, '""')}"` : sure;
}

export function ecrireCsv(entetes: string[], lignes: string[][]): string {
  const corps = [entetes, ...lignes].map((ligne) => ligne.map(echapper).join(";")).join("\r\n");
  return `﻿${corps}\r\n`;
}
