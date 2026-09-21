import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATALOGUE_EN } from "@/lib/i18n/catalogue/index";
import { traducteur } from "@/lib/i18n/catalogue";

/** Tous les textes passés à t("…") ou m("…") dans le code source (littéraux uniquement). */
function lireCles(): Map<string, string[]> {
  const cles = new Map<string, string[]>();
  const motif = /(?<![\w.$])(?:t|m)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) {
        if (nom === "node_modules" || nom === ".next") continue;
        parcourir(chemin);
      } else if (/\.tsx?$/.test(nom) && !chemin.includes(join("i18n", "catalogue"))) {
        const source = readFileSync(chemin, "utf8");
        for (const trouve of source.matchAll(motif)) {
          const brut = trouve[1];
          const texte = brut.startsWith('"') ? (JSON.parse(brut) as string) : (JSON.parse(`"${brut.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string);
          cles.set(texte, [...(cles.get(texte) ?? []), chemin]);
        }
      }
    }
  };
  parcourir("src");
  return cles;
}

const parametres = (texte: string) => [...texte.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");

describe("Internationalisation — catalogue anglais", () => {
  const utilisees = lireCles();

  test("tout texte passé à t() ou m() a une traduction anglaise", () => {
    const manquantes = [...utilisees.keys()].filter((cle) => !(cle in CATALOGUE_EN));
    expect(manquantes, `Textes sans traduction (à ajouter dans src/lib/i18n/catalogue/) :\n${manquantes.join("\n")}`).toEqual([]);
  });

  test("le catalogue ne contient aucune entrée orpheline (texte français modifié ou supprimé dans le code)", () => {
    const orphelines = Object.keys(CATALOGUE_EN).filter((cle) => !utilisees.has(cle));
    expect(orphelines, `Entrées jamais utilisées :\n${orphelines.join("\n")}`).toEqual([]);
  });

  test("la traduction porte les mêmes {paramètres} que le texte français", () => {
    const differentes = Object.entries(CATALOGUE_EN).filter(([fr, en]) => parametres(fr) !== parametres(en)).map(([fr]) => fr);
    expect(differentes).toEqual([]);
  });

  test("aucune traduction vide", () => {
    expect(Object.entries(CATALOGUE_EN).filter(([, en]) => !en.trim()).map(([fr]) => fr)).toEqual([]);
  });

  test("le traducteur : anglais avec paramètres, français inchangé, texte inconnu conservé", () => {
    const en = traducteur("en");
    const fr = traducteur("fr");
    expect(en("Nouveau contact")).toBe("New contact");
    expect(fr("Nouveau contact")).toBe("Nouveau contact");
    expect(en("Phrase jamais traduite {x}", { x: 3 })).toBe("Phrase jamais traduite 3");
    expect(fr("{n} contacts visibles.", { n: 2 })).toBe("2 contacts visibles.");
    expect(traducteur(undefined)("Nouveau contact")).toBe("Nouveau contact");
  });
});
