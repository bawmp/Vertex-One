import { describe, test, expect } from "vitest";
import { construirePromptSystemeKyria } from "@/lib/kyria/contexte";

/**
 * Trouvaille réelle (2026-09-18) : sans consigne explicite, Kyria a inventé « 24 à 48 heures » en réponse réelle sur le délai
 * de reversement du paiement Mobile Money (vérifié contre la vraie API Anthropic en production). Depuis le passage à Aangaraa Pay
 * (2026-09-21), le délai réel n'est pas encore confirmé : le prompt ne donne AUCUN chiffre, et ordonne de dire qu'on ne le
 * connaît pas plutôt que d'en avancer un.
 */
describe("Kyria — prompt système : délai de reversement du paiement Mobile Money", () => {
  const prompt = construirePromptSystemeKyria();

  test("n'annonce aucun nombre de jours (l'ancien délai de 8 jours était celui de CinetPay), ne cite plus les anciens prestataires", () => {
    expect(prompt).not.toContain("8 jours");
    expect(prompt).not.toMatch(/cinetpay|campay/i);
    expect(prompt).toContain("Aangaraa Pay");
  });

  test("interdit d'avancer un délai ou une commission, renvoie vers /contact, et interdit toujours « instantané »", () => {
    expect(prompt).toMatch(/n'avance JAMAIS un nombre/);
    expect(prompt).toContain("/contact");
    expect(prompt).toMatch(/JAMAIS présenter le paiement Mobile Money comme "instantané"/);
  });
});
