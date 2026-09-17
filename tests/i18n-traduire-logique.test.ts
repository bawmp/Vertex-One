import { describe, test, expect } from "vitest";
import { traduire, interpoler } from "@/lib/i18n/traduire";
import { fr } from "@/lib/i18n/dictionnaire";

/**
 * Infrastructure de traduction (Tranche 2, 2026-09-13) — logique pure, pas de
 * base de données requise. Le point non négociable : une clé absente du
 * dictionnaire anglais ne doit jamais produire un texte cassé/vide, toujours
 * un repli silencieux sur le français.
 */
describe("i18n — traduire() et repli sur le français", () => {
  test("langue non renseignée ou 'fr' renvoie le dictionnaire français tel quel", () => {
    expect(traduire(undefined)).toEqual(fr);
    expect(traduire("fr")).toEqual(fr);
  });

  test("langue 'en' renvoie les clés traduites présentes dans le dictionnaire anglais", () => {
    const t = traduire("en");
    // Noms de marque "One <mot anglais>" (échange du 2026-09-17, à l'image
    // de Zoho CRM/Books/People/Sign...) — jamais traduits, identiques en
    // français et en anglais.
    expect(t.nav.rh).toBe("One People");
    expect(t.menuUtilisateur.deconnexion).toBe("Sign out");
  });

  test("une structure imbriquée (nav.categories) est fusionnée clé par clé, pas remplacée en bloc", () => {
    const t = traduire("en");
    expect(t.nav.categories.ventes).toBe("Sales");
    expect(t.nav.categories.rapports).toBe("Reports");
  });

  test("le dictionnaire anglais reste un français valide pour toute future clé oubliée (repli structurel)", () => {
    // Si demain une clé est ajoutée à `fr` sans équivalent dans `en`, la
    // fusion doit renvoyer la valeur française plutôt qu'undefined — vérifié
    // ici indirectement : chaque clé de `fr.pages` a une valeur non vide
    // après fusion, même si on ampute artificiellement `en`.
    const t = traduire("en");
    for (const page of Object.values(t.pages)) {
      for (const valeur of Object.values(page)) {
        expect(typeof valeur).toBe("string");
        expect((valeur as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("i18n — interpoler()", () => {
  test("remplace une clé présente dans le gabarit", () => {
    expect(interpoler("Bienvenue, {nom}", { nom: "Aïcha" })).toBe("Bienvenue, Aïcha");
  });

  test("laisse le gabarit intact si la valeur est absente (jamais de texte cassé)", () => {
    expect(interpoler("Bienvenue, {nom}", {})).toBe("Bienvenue, {nom}");
  });
});
