import { describe, test, expect } from "vitest";
import { idTransactionExterne, analyserIdTransactionExterne, moyenPaiementDepuisOperateur } from "@/lib/cinetpay/utilitaires";

/**
 * Paiement en ligne CinetPay (2026-09-14) — logique pure de préfixage de
 * l'identifiant transmis à un service externe partagé entre entreprises
 * clientes (CLAUDE.md), sur laquelle repose la sécurité du webhook public
 * (src/app/api/paiements/cinetpay/notify/route.ts) : sans ce préfixage
 * correctement analysable, le webhook n'aurait aucun moyen de retrouver
 * l'entrepriseId sans une lecture anonyme en base.
 */
describe("CinetPay — préfixage/analyse du transaction_id externe", () => {
  test("construit un identifiant préfixé par l'entrepriseId", () => {
    expect(idTransactionExterne("ent123", "tent456")).toBe("ent123__tent456");
  });

  test("analyse un identifiant préfixé valide", () => {
    expect(analyserIdTransactionExterne("ent123__tent456")).toEqual({ entrepriseId: "ent123", tentativeId: "tent456" });
  });

  test("round-trip construction puis analyse", () => {
    const id = idTransactionExterne("cuid-entreprise-abc", "cuid-tentative-xyz");
    expect(analyserIdTransactionExterne(id)).toEqual({ entrepriseId: "cuid-entreprise-abc", tentativeId: "cuid-tentative-xyz" });
  });

  test("renvoie null pour un identifiant sans séparateur (jamais un crash du webhook)", () => {
    expect(analyserIdTransactionExterne("sans-separateur")).toBeNull();
  });

  test("coupe seulement au premier séparateur — un id de tentative ne contient jamais '__' (cuid2), mais la fonction reste robuste si un jour ce n'était plus vrai", () => {
    expect(analyserIdTransactionExterne("ent__tent__suffixe")).toEqual({ entrepriseId: "ent", tentativeId: "tent__suffixe" });
  });
});

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
