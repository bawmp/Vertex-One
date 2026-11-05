import { describe, expect, it } from "vitest";
import { analyserRaisonEchec, analyserReponseTransaction, codeMethodePaiement, lireIdentifiantTransaction, mapperStatut, masquerCle, moyenPaiementDepuisOperateur, operateurValide } from "@/lib/elyonpay/utilitaires";
import { referenceExterne } from "@/lib/paiement/reference";

describe("ElyonPay — états et modes de paiement", () => {
  it("PENDING (argent encaissé), WAITING_FOR_DELIVERY et DELIVERED sont les seuls succès", () => {
    for (const e of ["PENDING", "WAITING_FOR_DELIVERY", "DELIVERED", "delivered"]) expect(mapperStatut(e)).toBe("ACCEPTED");
  });
  it("CREATED et WAITING_FOR_PAYMENT attendent le payeur", () => {
    expect(mapperStatut("CREATED")).toBe("PENDING");
    expect(mapperStatut("WAITING_FOR_PAYMENT")).toBe("PENDING");
  });
  it("un rejet, un refus, une annulation ou un échec ferment la tentative", () => {
    for (const e of ["REJECTED", "DECLINED", "CANCELLED", "CANCELED", "FAILED"]) expect(mapperStatut(e)).toBe("REFUSED");
  });
  it("tout le reste est inconnu — jamais pris pour un succès (ACCEPTED compris : sa signification n'est pas documentée)", () => {
    for (const e of ["ACCEPTED", "", "SUCCESS", null, undefined, 42]) expect(mapperStatut(e)).toBe("INCONNU");
  });
  it("l'opérateur renvoyé retombe sur l'enum de moyens de paiement existant", () => {
    expect(moyenPaiementDepuisOperateur("ORANGE_MONEY")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("MTN")).toBe("mtn_momo");
    expect(moyenPaiementDepuisOperateur("Orange_Cameroon")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("STRIPE")).toBe("virement");
    expect(moyenPaiementDepuisOperateur(undefined)).toBe("mtn_momo");
  });
  it("codes de méthode : défauts de la documentation, surchargeables par l'environnement", () => {
    expect(codeMethodePaiement("MTN_Cameroon", {})).toBe("MTN_MONEY");
    expect(codeMethodePaiement("Orange_Cameroon", {})).toBe("ORANGE_MONEY");
    expect(codeMethodePaiement("MTN_Cameroon", { ELYONPAY_METHODE_MTN: "mtn_mobile_money" })).toBe("mtn_mobile_money");
    expect(operateurValide("MTN_Cameroon")).toBe(true);
    expect(operateurValide("ALL")).toBe(false);
  });
  it("la référence transmise garde son préfixe et ne contient que l'id de la tentative", () => {
    expect(referenceExterne("FACTURE", "abc123")).toBe("fac_abc123");
    expect(referenceExterne("ABONNEMENT", "abc123")).toBe("abo_abc123");
  });
});

describe("ElyonPay — identifiant de transaction", () => {
  it("lu sous data.uuid, à la racine, ou sous PSPid", () => {
    expect(lireIdentifiantTransaction({ success: true, data: { uuid: "CI032667e43abf11" } })).toBe("CI032667e43abf11");
    expect(lireIdentifiantTransaction({ uuid: "CI032667e43abf11" })).toBe("CI032667e43abf11");
    expect(lireIdentifiantTransaction({ data: { PSPid: "CI032667e43abf11" } })).toBe("CI032667e43abf11");
  });
  it("un format douteux ou absent donne null : jamais une valeur arbitraire dans une adresse", () => {
    expect(lireIdentifiantTransaction({ data: { uuid: "../etc" } })).toBeNull();
    expect(lireIdentifiantTransaction({ data: { uuid: "a b c d e f" } })).toBeNull();
    expect(lireIdentifiantTransaction(null)).toBeNull();
    expect(lireIdentifiantTransaction({ data: {} })).toBeNull();
  });
});

describe("ElyonPay — lecture de la relecture d'une transaction", () => {
  it("une transaction livrée donne un succès avec le montant, l'opérateur et la référence", () => {
    expect(analyserReponseTransaction({ state: "DELIVERED", amount: 15000, externalId: "fac_x", payment: { name: "MTN" } })).toEqual({ statut: "ACCEPTED", montant: 15000, operateur: "MTN", referenceExterne: "fac_x" });
  });
  it("lit aussi une enveloppe data", () => {
    expect(analyserReponseTransaction({ data: { state: "PENDING", amount: "1000" } })).toMatchObject({ statut: "ACCEPTED", montant: 1000 });
  });
  it("le montant lu est `amount`, jamais `totalCustomer`", () => {
    expect(analyserReponseTransaction({ state: "DELIVERED", amount: 1000, totalCustomer: 1030 }).montant).toBe(1000);
  });
  it("sans état reconnu : inconnu, jamais un succès", () => {
    expect(analyserReponseTransaction({}).statut).toBe("INCONNU");
    expect(analyserReponseTransaction("n'importe quoi").statut).toBe("INCONNU");
  });
  it("un échec porte sa raison", () => {
    expect(analyserReponseTransaction({ state: "DECLINED", message: "Solde insuffisant" })).toMatchObject({ statut: "REFUSED", raisonEchec: "SOLDE_OU_COMPTE" });
    expect(analyserRaisonEchec("CANCELLED", "")).toBe("ANNULE");
    expect(analyserRaisonEchec("FAILED", "request timed out")).toBe("EXPIRE");
    expect(analyserRaisonEchec("FAILED", "")).toBe("AUTRE");
  });
});

describe("ElyonPay — clé d'API", () => {
  it("est masquée dans un texte à consigner", () => {
    expect(masquerCle("clé pk_live_secret refusée", "pk_live_secret")).toBe("clé *** refusée");
    expect(masquerCle("rien", undefined)).toBe("rien");
  });
});
