import { describe, test, expect } from "vitest";
import { construirePromptSystemeKyria } from "@/lib/kyria/contexte";

/**
 * Trouvaille réelle (2026-09-18) : sans ce fait explicite dans le prompt,
 * Kyria a inventé "24 à 48 heures" en réponse réelle sur le délai de
 * reversement CinetPay (vérifié contre la vraie API Anthropic en
 * production) — la règle "ne jamais dire instantané" ne suffit pas seule,
 * il faut aussi donner le vrai chiffre pour que le modèle ne le devine pas.
 */
describe("Kyria — prompt système contient le vrai délai de reversement CinetPay", () => {
  test("mentionne 8 jours, jamais un autre délai inventé", () => {
    const prompt = construirePromptSystemeKyria();
    expect(prompt).toContain("8 jours");
    expect(prompt).not.toMatch(/24\s*(à|-)\s*48\s*heures/);
  });
});
