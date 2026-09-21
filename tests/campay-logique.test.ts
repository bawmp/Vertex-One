import { describe, test, expect } from "vitest";
import { createHmac } from "node:crypto";
import { lireReferenceExterne, mapperStatut, moyenPaiementDepuisOperateur, referenceExterne, signatureValide } from "@/lib/campay/utilitaires";

const jwt = (cle: string, charge: object, entete: object = { alg: "HS256", typ: "JWT" }) => {
  const e = Buffer.from(JSON.stringify(entete)).toString("base64url");
  const c = Buffer.from(JSON.stringify(charge)).toString("base64url");
  return `${e}.${c}.${createHmac("sha256", cle).update(`${e}.${c}`).digest("base64url")}`;
};

describe("CamPay — statuts et opérateurs", () => {
  test("SUCCESSFUL est le seul succès ; tout texte inconnu n'en est jamais un", () => {
    expect(mapperStatut("SUCCESSFUL")).toBe("ACCEPTED");
    expect(mapperStatut("FAILED")).toBe("REFUSED");
    expect(mapperStatut("PENDING")).toBe("PENDING");
    for (const autre of ["successful", "SUCCESS", "OK", "", undefined]) expect(mapperStatut(autre)).toBe("INCONNU");
  });

  test("Orange Money reconnu, tout le reste (MTN, absent) retombe sur MTN MoMo — jamais une valeur hors de l'enum", () => {
    expect(moyenPaiementDepuisOperateur("ORANGE")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("Orange Money")).toBe("orange_money");
    expect(moyenPaiementDepuisOperateur("MTN")).toBe("mtn_momo");
    expect(moyenPaiementDepuisOperateur(undefined)).toBe("mtn_momo");
  });
});

describe("CamPay — référence externe", () => {
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

describe("CamPay — signature des notifications (JWT HS256, clé webhook)", () => {
  const cle = "cle-webhook-de-test";
  const maintenant = new Date("2026-09-21T12:00:00Z");
  const charge = { iat: 1, exp: Math.floor(maintenant.getTime() / 1000) + 3600, source: "CamPay" };

  test("accepte une signature correcte, non expirée", () => {
    expect(signatureValide(jwt(cle, charge), cle, maintenant)).toBe(true);
  });

  test("refuse une mauvaise clé, une charge modifiée, un algorithme différent, une signature expirée, un format cassé, un champ vide", () => {
    expect(signatureValide(jwt("autre-cle", charge), cle, maintenant)).toBe(false);
    const [e, , s] = jwt(cle, charge).split(".");
    const chargeFalsifiee = Buffer.from(JSON.stringify({ ...charge, source: "Pirate" })).toString("base64url");
    expect(signatureValide(`${e}.${chargeFalsifiee}.${s}`, cle, maintenant)).toBe(false);
    expect(signatureValide(jwt(cle, charge, { alg: "none" }), cle, maintenant)).toBe(false);
    expect(signatureValide(jwt(cle, { ...charge, exp: Math.floor(maintenant.getTime() / 1000) - 1 }), cle, maintenant)).toBe(false);
    for (const cassee of ["abc", "a.b", "a.b.c.d", "", null, undefined]) expect(signatureValide(cassee, cle, maintenant), String(cassee)).toBe(false);
    expect(signatureValide(jwt(cle, charge), undefined, maintenant)).toBe(false);
    expect(signatureValide(jwt(cle, charge), "", maintenant)).toBe(false);
  });

  // Signature réelle renvoyée par le bac à sable CamPay le 2026-09-21 (durée de vie : 1 h) : prouve que notre contrôle
  // s'accorde avec ce que CamPay signe vraiment. Ne tourne qu'avec la vraie clé (variable CAMPAY_WEBHOOK_KEY, jamais dans le dépôt).
  test.skipIf(!process.env.CAMPAY_WEBHOOK_KEY)("valide une signature réelle de CamPay avec la vraie clé webhook", () => {
    const reelle = "eyJhbGciOiJIUzI1NiIsImFwcCI6InZlcnRleG9uZSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3OTAwMjA0NTUsIm5iZiI6MTc5MDAyMDQ1NSwiZXhwIjoxNzkwMDI0MDU1LCJzb3VyY2UiOiJDYW1QYXkifQ._UiGZg184C06OUCY-HFBQr-n4HXP-_iiTiLjxDbiaUg";
    const emission = JSON.parse(Buffer.from(reelle.split(".")[1], "base64url").toString()).iat as number;
    expect(signatureValide(reelle, process.env.CAMPAY_WEBHOOK_KEY, new Date((emission + 60) * 1000))).toBe(true);
    expect(signatureValide(reelle, process.env.CAMPAY_WEBHOOK_KEY + "x", new Date((emission + 60) * 1000))).toBe(false);
  });
});
