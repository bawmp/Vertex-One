import { describe, expect, it } from "vitest";
import { contenuExport, dateAAAAMMJJ, dateJJMMAA, formatLogicielValide, libelleExport, preparerLignesExport, texteEcritures, versAnsi } from "@/lib/comptabilite/export-logiciels";
import type { LigneLivre } from "@/lib/comptabilite/livres";

const l = (id: string, piece: string | null, journal: LigneLivre["journal"], compte: string, debit: number, credit: number, date = new Date("2026-03-31T23:30:00Z")): LigneLivre => ({
  id, date, libelle: `Facture ${id}`, numeroCompte: compte, libelleCompte: "x", debit, credit, journal, piece,
});

describe("export vers les logiciels de comptabilité", () => {
  const lignes = [l("a", "F1", "VT", "411000", 1190, 0), l("b", "F1", "VT", "701000", 0, 1000), l("c", "F1", "VT", "443100", 0, 190), l("d", "F2", "VT", "411000", 500, 0), l("e", null, "OD", "601000", 10, 0)];

  it("une pièce par document d'origine, numérotée par journal", () => {
    const p = preparerLignesExport(lignes);
    expect(p.map((x) => x.piece)).toEqual(["VT00001", "VT00001", "VT00001", "VT00002", "OD00001"]);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it("dates à l'heure de Douala (23h30 UTC = lendemain)", () => {
    const d = new Date("2026-03-31T23:30:00Z");
    expect(dateJJMMAA(d)).toBe("010426");
    expect(dateAAAAMMJJ(d)).toBe("20260401");
  });

  it("Sage : tabulations, virgule décimale, débit/crédit séparés", () => {
    const t = texteEcritures(preparerLignesExport(lignes), "sage").split("\r\n");
    expect(t[0]).toBe("Journal\tDate\tPiece\tCompte\tLibelle\tDebit\tCredit");
    expect(t[1]).toBe("VT\t010426\tVT00001\t411000\tFacture a\t1190\t0");
  });

  it("Ciel : un montant et un sens D/C", () => {
    const t = texteEcritures(preparerLignesExport(lignes), "ciel").split("\r\n");
    expect(t[2]).toBe("2\t010426\tVT\t701000\tVT00001\tFacture b\t1000\tC");
  });

  it("le total des débits égale celui des crédits quand les écritures sont équilibrées", () => {
    const eq = lignes.slice(0, 3);
    expect(eq.reduce((s, x) => s + x.debit, 0)).toBe(eq.reduce((s, x) => s + x.credit, 0));
  });

  it("libellé nettoyé : pas de tabulation ni de point-virgule, 60 caractères", () => {
    expect(libelleExport("a\tb;c\nd")).toBe("a b c d");
    expect(libelleExport("x".repeat(100))).toHaveLength(60);
  });

  it("ANSI : accents conservés, caractère hors jeu remplacé", () => {
    expect([...versAnsi("é€→")]).toEqual([0xe9, 0x80, 0x3f]);
  });

  it("format inconnu refusé ; FEC en UTF-8 avec BOM", () => {
    expect(formatLogicielValide("sage")).toBe(true);
    expect(formatLogicielValide("excel")).toBe(false);
    expect(contenuExport(lignes, "fec").corps.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
});
