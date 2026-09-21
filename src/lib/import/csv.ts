/**
 * Lecture d'un CSV (RFC 4180) : guillemets, guillemets doublés, sauts de ligne dans une cellule, BOM, CRLF. Le séparateur
 * (virgule, point-virgule ou tabulation) est détecté sur la première ligne : Excel en français exporte avec « ; ».
 */
export function detecterSeparateur(texte: string): string {
  const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
  let meilleur = ",";
  let max = 0;
  for (const sep of [",", ";", "\t"]) {
    // On ignore ce qui est entre guillemets, où un séparateur n'en est pas un.
    const nombre = premiere.replace(/"[^"]*"/g, "").split(sep).length - 1;
    if (nombre > max) {
      max = nombre;
      meilleur = sep;
    }
  }
  return meilleur;
}

export function lireCsv(source: string): string[][] {
  const texte = source.replace(/^﻿/, "");
  const sep = detecterSeparateur(texte);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = "";
  let entreGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          cellule += '"';
          i++;
        } else entreGuillemets = false;
      } else cellule += c;
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += c;
  }
  if (cellule !== "" || ligne.length > 0) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  // Les lignes entièrement vides (fin de fichier, séparateurs) ne portent aucune donnée.
  return lignes.filter((l) => l.some((cellule) => cellule.trim() !== ""));
}
