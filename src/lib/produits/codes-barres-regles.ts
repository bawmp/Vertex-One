/**
 * Codes-barres — règles pures (utilisables dans le navigateur). Un code est une suite de 3 à 48 caractères (lettres, chiffres, - . _ /) :
 * tout ce que lit une douchette ou la caméra. Pour les codes que Vertex One génère lui-même, on utilise l'EAN-13 (13 chiffres, le plus
 * répandu), dans la plage 200-299 réservée par GS1 à l'usage interne d'une entreprise : aucun risque de heurter le code d'un fabricant.
 */

/** Nettoie ce que renvoie un lecteur (espaces, retour chariot) et vérifie la forme. Retourne null si le code n'est pas utilisable. */
export function normaliserCode(brut: string): string | null {
  const code = brut.replace(/[\s\u0000-\u001f]+/g, "").trim();
  if (code.length < 3 || code.length > 48) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(code)) return null;
  return code;
}

/** Chiffre de contrôle EAN-13 des 12 premiers chiffres. */
export function chiffreControleEan13(douze: string): number {
  let somme = 0;
  for (let i = 0; i < 12; i++) somme += Number(douze[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (somme % 10)) % 10;
}

export function ean13Valide(code: string): boolean {
  return /^\d{13}$/.test(code) && chiffreControleEan13(code.slice(0, 12)) === Number(code[12]);
}

/** EAN-13 interne : préfixe 200 (usage interne), 9 chiffres aléatoires, chiffre de contrôle. `tirage` rend un entier 0-9 (testable). */
export function genererEan13Interne(tirage: () => number = () => Math.floor(Math.random() * 10)): string {
  let douze = "200";
  for (let i = 0; i < 9; i++) douze += String(tirage() % 10);
  return douze + chiffreControleEan13(douze);
}

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Les 95 modules (1 = barre, 0 = espace) d'un EAN-13 valide : garde, 6 chiffres, garde centrale, 6 chiffres, garde. */
export function modulesEan13(code: string): string | null {
  if (!ean13Valide(code)) return null;
  const chiffres = [...code].map(Number);
  const parite = PARITE[chiffres[0]];
  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (parite[i] === "L" ? L : G)[chiffres[i + 1]];
  bits += "01010";
  for (let i = 0; i < 6; i++) bits += R[chiffres[i + 7]];
  return bits + "101";
}

/** Relit des modules et retrouve le code (sert à vérifier le dessin dans les tests). */
export function decoderModulesEan13(bits: string): string | null {
  if (bits.length !== 95 || !bits.startsWith("101") || !bits.endsWith("101") || bits.slice(45, 50) !== "01010") return null;
  let parite = "";
  let gauche = "";
  for (let i = 0; i < 6; i++) {
    const motif = bits.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(motif);
    const g = G.indexOf(motif);
    if (l >= 0) { parite += "L"; gauche += l; } else if (g >= 0) { parite += "G"; gauche += g; } else return null;
  }
  const premier = PARITE.indexOf(parite);
  if (premier < 0) return null;
  let droite = "";
  for (let i = 0; i < 6; i++) {
    const r = R.indexOf(bits.slice(50 + i * 7, 57 + i * 7));
    if (r < 0) return null;
    droite += r;
  }
  return `${premier}${gauche}${droite}`;
}

/** Dessin SVG d'un EAN-13 (barres noires sur fond blanc, chiffres dessous). Null si le code n'est pas un EAN-13 valide. */
export function svgEan13(code: string, largeurModule = 2, hauteur = 70): string | null {
  const bits = modulesEan13(code);
  if (!bits) return null;
  const marge = 9 * largeurModule;
  const largeur = 95 * largeurModule + 2 * marge;
  const total = hauteur + 14;
  let barres = "";
  for (let i = 0; i < 95; ) {
    if (bits[i] === "1") {
      let j = i;
      while (j < 95 && bits[j] === "1") j++;
      barres += `<rect x="${marge + i * largeurModule}" y="0" width="${(j - i) * largeurModule}" height="${hauteur}"/>`;
      i = j;
    } else i++;
  }
  const texte = `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${total}" width="${largeur}" height="${total}" role="img" aria-label="${code}"><rect width="${largeur}" height="${total}" fill="#fff"/><g fill="#000">${barres}</g><text x="${largeur / 2}" y="${hauteur + 11}" font-family="monospace" font-size="11" text-anchor="middle" fill="#000">${texte}</text></svg>`;
}
