import { describe, test, expect } from "vitest";
import { ecrireCsv, neutraliserFormule } from "@/lib/export/csv";
import { lireCsv } from "@/lib/import/csv";
import { appliquerCorrespondance } from "@/lib/import/moteur";

describe("Écriture CSV de l'export", () => {
  test("UTF-8 avec BOM, séparateur « ; », fins de ligne CRLF", () => {
    const csv = ecrireCsv(["Nom", "Ville"], [["Élise", "Douala"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Nom;Ville\r\nÉlise;Douala\r\n");
  });

  test("les cellules avec séparateur, guillemet ou saut de ligne sont protégées et se relisent à l'identique", () => {
    const lignes = [
      ["Dupont; Fils", 'Il a dit "bonjour"', "ligne 1\nligne 2"],
      ["Simple", "", "fin"],
    ];
    const relu = lireCsv(ecrireCsv(["A", "B", "C"], lignes));
    expect(relu).toEqual([["A", "B", "C"], ...lignes]);
  });

  test("une cellule qui commence par = + - @ ne peut pas s'exécuter comme formule dans un tableur", () => {
    expect(neutraliserFormule('=HYPERLINK("http://pirate.example")')).toBe(`'=HYPERLINK("http://pirate.example")`);
    expect(neutraliserFormule("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(neutraliserFormule("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(neutraliserFormule("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(neutraliserFormule("\t=1+1")).toBe("'\t=1+1");
  });

  test("un téléphone ou un nombre n'est pas modifié (il ne peut rien exécuter)", () => {
    for (const sain of ["+237 690 11 12 22", "+237690111222", "-500", "(+237) 690-11-12-22", "12,5", "Dupont", "", "Marie-Claire"]) {
      expect(neutraliserFormule(sain), sain).toBe(sain);
    }
  });

  test("aller-retour : la protection est retirée à l'import, la donnée retrouve sa valeur d'origine", () => {
    const original = '=HYPERLINK("http://pirate.example")';
    const csv = ecrireCsv(["Notes"], [[original]]);
    expect(csv).toContain(`'=HYPERLINK`); // protégé dans le fichier
    const [entetes, ...donnees] = lireCsv(csv);
    const lignes = appliquerCorrespondance(donnees.map((l) => Object.fromEntries(entetes.map((e, i) => [e, l[i]]))), { notes: "Notes" });
    expect(lignes[0].v.notes).toBe(original); // rendue telle quelle dans l'application
  });

  test("à l'import, une apostrophe qui n'est pas une protection est conservée", () => {
    const lignes = appliquerCorrespondance([{ Notes: "'Quelqu'un' a dit oui" }], { notes: "Notes" });
    expect(lignes[0].v.notes).toBe("'Quelqu'un' a dit oui");
  });
});
