import { describe, test, expect } from "vitest";
import { estEmailStaff } from "@/lib/plateforme/acces-logique";

/**
 * Console interne plateforme (2026-09-14) — logique pure, pas de base de
 * données requise.
 */
describe("Console plateforme — estEmailStaff()", () => {
  test("email présent dans la liste", () => {
    expect(estEmailStaff("fondateur@vertexone.cm", "fondateur@vertexone.cm,autre@x.cm")).toBe(true);
  });

  test("insensible à la casse et aux espaces", () => {
    expect(estEmailStaff("  Fondateur@VertexOne.cm  ", "fondateur@vertexone.cm, autre@x.cm")).toBe(true);
  });

  test("email absent de la liste", () => {
    expect(estEmailStaff("intrus@x.cm", "fondateur@vertexone.cm")).toBe(false);
  });

  test("aucune session (email nul)", () => {
    expect(estEmailStaff(null, "fondateur@vertexone.cm")).toBe(false);
    expect(estEmailStaff(undefined, "fondateur@vertexone.cm")).toBe(false);
  });

  test("liste blanche vide ou non configurée — jamais staff par défaut", () => {
    expect(estEmailStaff("fondateur@vertexone.cm", undefined)).toBe(false);
    expect(estEmailStaff("fondateur@vertexone.cm", "")).toBe(false);
  });

  test("une chaîne vide dans la liste (virgule en trop) n'autorise jamais un email vide", () => {
    expect(estEmailStaff("", "fondateur@vertexone.cm,")).toBe(false);
  });
});
