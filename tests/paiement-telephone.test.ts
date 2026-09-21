import { describe, test, expect } from "vitest";
import { telephoneInternational } from "@/lib/paiement/telephone";

// Bug réel trouvé en testant le paiement depuis le lien client : CinetPay rejetait « 690111222 »
// avec « must be in international format +XXXXXXXXXXXX ».
describe("CinetPay — numéro de téléphone au format international", () => {
  test("ajoute +237 à un numéro camerounais local, avec ou sans séparateurs", () => {
    expect(telephoneInternational("690111222")).toBe("+237690111222");
    expect(telephoneInternational("690 11 12 22")).toBe("+237690111222");
    expect(telephoneInternational("6.90.11.12.22")).toBe("+237690111222");
    expect(telephoneInternational("222 33 44 55")).toBe("+237222334455");
  });

  test("convertit 237… et 00237… en +237…", () => {
    expect(telephoneInternational("237690111222")).toBe("+237690111222");
    expect(telephoneInternational("00237690111222")).toBe("+237690111222");
  });

  test("laisse un numéro déjà international inchangé", () => {
    expect(telephoneInternational("+237690111222")).toBe("+237690111222");
    expect(telephoneInternational("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  test("renvoie une chaîne vide pour un numéro vide ou inexploitable (jamais un numéro faux)", () => {
    expect(telephoneInternational("")).toBe("");
    expect(telephoneInternational(null)).toBe("");
    expect(telephoneInternational(undefined)).toBe("");
    expect(telephoneInternational("12345")).toBe("");
    expect(telephoneInternational("abc")).toBe("");
    expect(telephoneInternational("+12")).toBe("");
  });
});
