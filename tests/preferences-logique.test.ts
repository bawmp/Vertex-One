import { describe, test, expect } from "vitest";
import { ordonnerParPreference } from "@/lib/i18n/nav";

/**
 * Réordonnancement personnel de la sidebar (Tranche 3, 2026-09-13) — logique
 * pure. Point non négociable : une entrée absente de l'ordre enregistré (un
 * nouveau module ajouté après coup) doit atterrir en fin de liste, jamais
 * masquée ni provoquer d'erreur.
 */
describe("Préférences — ordonnerParPreference()", () => {
  test("sans ordre enregistré (null), renvoie la liste inchangée", () => {
    expect(ordonnerParPreference(["CRM", "FACO", "Projets"], null)).toEqual(["CRM", "FACO", "Projets"]);
  });

  test("applique l'ordre enregistré", () => {
    expect(ordonnerParPreference(["CRM", "FACO", "Projets"], ["FACO", "CRM", "Projets"])).toEqual(["FACO", "CRM", "Projets"]);
  });

  test("une entrée absente de l'ordre enregistré atterrit en fin de liste, jamais masquée", () => {
    // "Projets" n'existait pas encore quand l'ordre a été enregistré.
    expect(ordonnerParPreference(["CRM", "FACO", "Projets"], ["FACO", "CRM"])).toEqual(["FACO", "CRM", "Projets"]);
  });

  test("plusieurs entrées absentes gardent leur ordre relatif d'origine (tri stable)", () => {
    expect(ordonnerParPreference(["CRM", "FACO", "Projets", "Documents"], ["FACO"])).toEqual(["FACO", "CRM", "Projets", "Documents"]);
  });

  test("un ordre enregistré vide équivaut à aucune préférence effective (tri stable, ordre d'origine conservé)", () => {
    expect(ordonnerParPreference(["CRM", "FACO"], [])).toEqual(["CRM", "FACO"]);
  });
});
