import { describe, test, expect } from "vitest";
import { moyenPaiementDepuisOperateur } from "@/lib/cinetpay/utilitaires";

describe("CinetPay — mappage de l'opérateur vers moyenPaiement", () => {
  test("reconnaît Orange Money", () => {
    expect(moyenPaiementDepuisOperateur("ORANGE")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("OM")).toBe("orange_money");
  });

  test("retombe sur MTN MoMo pour tout le reste, y compris absent (jamais une valeur hors de l'enum moyenPaiement)", () => {
    expect(moyenPaiementDepuisOperateur("MOMO")).toBe("mtn_momo");
    expect(moyenPaiementDepuisOperateur("MTN")).toBe("mtn_momo");
    expect(moyenPaiementDepuisOperateur(undefined)).toBe("mtn_momo");
  });
});
