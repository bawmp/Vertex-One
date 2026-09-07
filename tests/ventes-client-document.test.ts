import { describe, test, expect } from "vitest";
import { memeClientVente } from "@/lib/facturation/client-document";

/**
 * Découplage Books/CRM (échange du 2026-09-07) — memeClientVente() remplace
 * l'ancienne comparaison sur dealId (devenu optionnel) comme garde-fou de
 * appliquerAcompteSurFacture() : deux documents appartiennent au même
 * client si leur Compte coïncide (société commune, contacts différents
 * possibles), sinon si leur Contact coïncide directement.
 */
describe("memeClientVente()", () => {
  test("même Compte, Contacts différents → vrai", () => {
    expect(memeClientVente({ contactId: "contact-a", compteId: "compte-x" }, { contactId: "contact-b", compteId: "compte-x" })).toBe(true);
  });

  test("Comptes différents, même Contact → faux (le Compte prime dès qu'il est renseigné des deux côtés)", () => {
    expect(memeClientVente({ contactId: "contact-a", compteId: "compte-x" }, { contactId: "contact-a", compteId: "compte-y" })).toBe(false);
  });

  test("aucun Compte des deux côtés, même Contact → vrai", () => {
    expect(memeClientVente({ contactId: "contact-a", compteId: null }, { contactId: "contact-a", compteId: null })).toBe(true);
  });

  test("aucun Compte des deux côtés, Contacts différents → faux", () => {
    expect(memeClientVente({ contactId: "contact-a", compteId: null }, { contactId: "contact-b", compteId: null })).toBe(false);
  });

  test("un seul côté a un Compte → repli sur le Contact", () => {
    expect(memeClientVente({ contactId: "contact-a", compteId: "compte-x" }, { contactId: "contact-a", compteId: null })).toBe(true);
    expect(memeClientVente({ contactId: "contact-a", compteId: "compte-x" }, { contactId: "contact-b", compteId: null })).toBe(false);
  });
});
