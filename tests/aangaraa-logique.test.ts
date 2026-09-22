import { describe, test, expect } from "vitest";
import { analyserReponseStatut, lirePayToken, mapperStatut, masquerCle, moyenPaiementDepuisOperateur, urlPaiementAbsolue } from "@/lib/aangaraa/utilitaires";
import { lireReferenceExterne, referenceExterne } from "@/lib/paiement/reference";

describe("Aangaraa Pay — statuts et modes de paiement", () => {
  test("SUCCESSFUL est le seul succès ; lien expiré, annulé ou refusé = échec de la tentative ; tout texte inconnu n'en est jamais un", () => {
    expect(mapperStatut("SUCCESSFUL")).toBe("ACCEPTED");
    expect(mapperStatut("successful")).toBe("ACCEPTED");
    for (const echec of ["FAILED", "CANCELLED", "EXPIRED"]) expect(mapperStatut(echec), echec).toBe("REFUSED");
    expect(mapperStatut("PENDING")).toBe("PENDING");
    for (const autre of ["SUCCESS", "OK", "PAID", "", undefined, null, 200, {}]) expect(mapperStatut(autre), String(autre)).toBe("INCONNU");
  });

  test("Orange, MTN, carte : jamais une valeur hors de l'enum (carte → virement, même compte bancaire)", () => {
    expect(moyenPaiementDepuisOperateur("Orange_Cameroon")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("MTN_Cameroon")).toBe("mtn_momo");
    expect(moyenPaiementDepuisOperateur("CARTE")).toBe("virement");
    expect(moyenPaiementDepuisOperateur("Stripe")).toBe("virement");
    expect(moyenPaiementDepuisOperateur(undefined)).toBe("mtn_momo");
  });
});

describe("Aangaraa Pay — notification : le paytoken", () => {
  test("lit « paytoken » (charge du webhook) ou « payToken », et refuse tout format douteux avant qu'il parte vers l'API", () => {
    expect(lirePayToken({ paytoken: "MT1234567890" })).toBe("MT1234567890");
    expect(lirePayToken({ payToken: "e92224da-1987-47e6-958b-78433bd92a66" })).toBe("e92224da-1987-47e6-958b-78433bd92a66");
    for (const mauvais of ["", "abc", "a b c d e f g", "../../etc", "x".repeat(200), "<script>alert(1)</script>", 12345678]) {
      expect(lirePayToken({ paytoken: mauvais }), String(mauvais)).toBeNull();
    }
    expect(lirePayToken({})).toBeNull();
    expect(lirePayToken(null)).toBeNull();
  });
});

describe("Aangaraa Pay — lien de paiement", () => {
  test("un lien relatif est complété par l'adresse de la page, un lien absolu https est gardé, tout le reste est refusé", () => {
    expect(urlPaiementAbsolue("/payment?id=1&expires=2&signature=3", "https://aangaraa-pay.com")).toBe("https://aangaraa-pay.com/payment?id=1&expires=2&signature=3");
    expect(urlPaiementAbsolue("/payment?id=1", "https://pay.exemple.cm/")).toBe("https://pay.exemple.cm/payment?id=1");
    expect(urlPaiementAbsolue("https://pay.exemple.cm/p/abc", "https://aangaraa-pay.com")).toBe("https://pay.exemple.cm/p/abc");
    expect(urlPaiementAbsolue("http://pay.exemple.cm/p/abc", "https://aangaraa-pay.com")).toBeNull(); // jamais un lien non chiffré
    expect(urlPaiementAbsolue("javascript:alert(1)", "https://aangaraa-pay.com")).toBeNull();
  });
});

describe("Aangaraa Pay — lecture de la relecture d'un statut", () => {
  test("cherche les champs à la racine ou sous « data » ; montant arrondi en entier", () => {
    const attendu = { statut: "ACCEPTED", referenceExterne: "fac_abc", montant: 11925, operateur: "MTN_Cameroon" };
    expect(analyserReponseStatut({ status: "SUCCESSFUL", transaction_id: "fac_abc", amount: "11925.00", operator: "MTN_Cameroon" })).toEqual(attendu);
    expect(analyserReponseStatut({ statusCode: 200, data: { status: "SUCCESSFUL", transaction_id: "fac_abc", amount: 11925, operator: "MTN_Cameroon" } })).toEqual(attendu);
  });

  test("une réponse illisible, vide ou d'une forme inattendue ne donne JAMAIS un succès", () => {
    for (const corps of [null, undefined, "SUCCESSFUL", 42, [], {}, { data: {} }, { status: 200 }, { data: { status: "OK" } }]) {
      expect(analyserReponseStatut(corps).statut, JSON.stringify(corps)).toBe("INCONNU");
    }
  });
});

describe("Aangaraa Pay — clé d'application", () => {
  test("la clé est masquée dans ce qui est consigné (les messages d'erreur de l'API la répètent)", () => {
    const journal = masquerCle('HTTP 400 {"message":"Service with app_key SECRET-123 not found"}', "SECRET-123");
    expect(journal).not.toContain("SECRET-123");
    expect(journal).toContain("***");
    expect(masquerCle("rien à masquer", "SECRET-123")).toBe("rien à masquer");
    expect(masquerCle("texte", undefined)).toBe("texte");
  });
});

describe("Paiement — référence externe", () => {
  test("le préfixe distingue une facture d'un abonnement, et l'aller-retour est exact", () => {
    expect(referenceExterne("FACTURE", "abc123")).toBe("fac_abc123");
    expect(referenceExterne("ABONNEMENT", "abc123")).toBe("abo_abc123");
    expect(lireReferenceExterne("fac_abc123")).toEqual({ nature: "FACTURE", id: "abc123" });
    expect(lireReferenceExterne("abo_abc123")).toEqual({ nature: "ABONNEMENT", id: "abc123" });
  });

  test("une référence sans préfixe connu, vide ou réduite au préfixe est refusée (jamais devinée)", () => {
    for (const r of ["abc123", "fac_", "abo_", "", undefined, null, "FAC_x", "xfac_abc"]) expect(lireReferenceExterne(r), String(r)).toBeNull();
  });
});
