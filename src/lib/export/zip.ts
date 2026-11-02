/**
 * Écriture d'une archive ZIP sans compression (méthode « stored »), sans dépendance : suffisante pour un dossier de fichiers CSV
 * et lisible par tous les logiciels (Windows, macOS, Excel, 7-Zip). Les noms de fichiers sont en UTF-8 (drapeau 0x0800).
 */
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(donnees: Uint8Array): number {
  let c = 0xffffffff;
  for (const octet of donnees) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type FichierZip = { nom: string; contenu: string | Uint8Array };

/** Date et heure au format MS-DOS (deux octets chacune) pour un instant donné. */
function dateDos(d: Date): { heure: number; date: number } {
  const annee = Math.max(d.getUTCFullYear(), 1980);
  return { heure: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), date: ((annee - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}

export function creerZip(fichiers: FichierZip[], maintenant: Date = new Date()): Buffer {
  const { heure, date } = dateDos(maintenant);
  const morceaux: Buffer[] = [];
  const centrale: Buffer[] = [];
  let decalage = 0;

  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, "utf8");
    const contenu = typeof f.contenu === "string" ? Buffer.from(f.contenu, "utf8") : Buffer.from(f.contenu);
    const crc = crc32(contenu);

    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4);
    entete.writeUInt16LE(0x0800, 6);
    entete.writeUInt16LE(0, 8);
    entete.writeUInt16LE(heure, 10);
    entete.writeUInt16LE(date, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(contenu.length, 18);
    entete.writeUInt32LE(contenu.length, 22);
    entete.writeUInt16LE(nom.length, 26);
    entete.writeUInt16LE(0, 28);
    morceaux.push(entete, nom, contenu);

    const entree = Buffer.alloc(46);
    entree.writeUInt32LE(0x02014b50, 0);
    entree.writeUInt16LE(20, 4);
    entree.writeUInt16LE(20, 6);
    entree.writeUInt16LE(0x0800, 8);
    entree.writeUInt16LE(0, 10);
    entree.writeUInt16LE(heure, 12);
    entree.writeUInt16LE(date, 14);
    entree.writeUInt32LE(crc, 16);
    entree.writeUInt32LE(contenu.length, 20);
    entree.writeUInt32LE(contenu.length, 24);
    entree.writeUInt16LE(nom.length, 28);
    entree.writeUInt32LE(decalage, 42);
    centrale.push(entree, nom);

    decalage += entete.length + nom.length + contenu.length;
  }

  const tailleCentrale = centrale.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentrale, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...morceaux, ...centrale, fin]);
}
