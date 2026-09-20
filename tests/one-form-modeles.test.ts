import { describe, it, expect } from "vitest";
import { MODELES_FORMULAIRES, trouverModele } from "../src/lib/one-form/modeles";
import { CATEGORIES_FICHIER } from "../src/lib/one-form/fichiers";

const TYPES_AVEC_OPTIONS = ["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"];

describe("modèles de formulaires One Form", () => {
  it("chaque modèle a un identifiant unique et du contenu", () => {
    const ids = MODELES_FORMULAIRES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODELES_FORMULAIRES) {
      expect(m.nom.length).toBeGreaterThan(2);
      expect(m.titre.length).toBeGreaterThan(2);
      expect(m.messageConfirmation.length).toBeGreaterThan(0);
      expect(m.champs.length).toBeGreaterThan(2);
    }
  });

  it("les champs à choix ont des options, les champs fichier des catégories valides", () => {
    for (const m of MODELES_FORMULAIRES) {
      for (const c of m.champs) {
        expect(c.libelle.trim().length).toBeGreaterThan(0);
        if (TYPES_AVEC_OPTIONS.includes(c.type)) expect(c.options?.length ?? 0).toBeGreaterThan(1);
        if (c.type === "FICHIER") {
          expect(c.options?.length ?? 0).toBeGreaterThan(0);
          for (const o of c.options ?? []) expect(CATEGORIES_FICHIER).toContain(o);
        }
      }
    }
  });

  it("un modèle qui crée un Lead contient un champ Téléphone obligatoire (sinon aucun Lead ne serait créé)", () => {
    for (const m of MODELES_FORMULAIRES.filter((x) => x.creerLeadALaReponse)) {
      expect(m.champs.some((c) => c.type === "TELEPHONE" && c.obligatoire)).toBe(true);
    }
  });

  it("trouverModele renvoie undefined pour un identifiant inconnu", () => {
    expect(trouverModele("n-importe-quoi")).toBeUndefined();
    expect(trouverModele("contact")?.nom).toBe("Contact");
  });
});
