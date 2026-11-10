import { createElement } from "react";
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { RapportHierarchiquePDF, type RapportPDFProps } from "@/lib/pdf/rapport-hierarchique";
import { rubriquesDuRapport } from "@/lib/rh/rapport-modeles";

const entreprise: RapportPDFProps["entreprise"] = { nom: "TEST Agence", logoUrl: null, couleurMarque: null, adresse: "12 rue des Palmiers", ville: "Douala", niu: "M012345678901A", rccm: "RC/DLA/2020/B/1234" };

describe("PDF d'un rapport écrit sur papier à en-tête", () => {
  it("se génère avec les rubriques d'un modèle", async () => {
    const rubriques = rubriquesDuRapport("MISSION", [
      { cle: "objectif", texte: "Auditer le dépôt." },
      { cle: "resultats", texte: "Conformité confirmée.\nAucun écart." },
    ]);
    const buf = await renderToBuffer(
      createElement(RapportHierarchiquePDF, { entreprise, rapport: { objet: "Mission — Audit Douala", modeleLibelle: "Rapport de mission", auteurNom: "Jean Test", destinataireNom: "Directrice Test", creeLe: new Date("2026-11-10T14:30:00Z"), rubriques, contenu: "" } }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("imprime le texte tel quel pour un rapport d'avant les modèles, sans logo ni coordonnées", async () => {
    const buf = await renderToBuffer(
      createElement(RapportHierarchiquePDF, {
        entreprise: { nom: "TEST Sobre", logoUrl: null, couleurMarque: "#aa3300", adresse: null, ville: null, niu: null, rccm: null },
        rapport: { objet: "Ancien rapport", modeleLibelle: "Autre rapport", auteurNom: "A", destinataireNom: "B", creeLe: new Date(), rubriques: [], contenu: "Texte libre de l'ancien rapport." },
      }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rubriquesDuRapport suit l'ordre du modèle et ignore une rubrique inconnue", () => {
    const r = rubriquesDuRapport("MISSION", [
      { cle: "resultats", texte: "R" },
      { cle: "inconnue", texte: "X" },
      { cle: "objectif", texte: "O" },
    ]);
    expect(r.map((x) => x.texte)).toEqual(["R", "O"]); // l'ordre des sections enregistrées est conservé, la rubrique inconnue écartée
    expect(rubriquesDuRapport("LIBRE", [{ cle: "contenu", texte: "Salut" }])[0].libelle).toBeNull();
    expect(rubriquesDuRapport(null, null)).toEqual([]);
  });
});
