import { describe, expect, test } from "vitest";
import { MODULES_OUVERTS_AUX_MANAGERS, portee, peut, type Module } from "@/lib/permissions";

/**
 * Réglage « Les managers voient toute l'entreprise » : seule la VISIBILITÉ des Managers s'élargit, sur les modules métier ; jamais leurs droits,
 * jamais la RH / le recrutement / la messagerie, jamais le rôle Employé, et jamais sans le réglage.
 */
describe("Portée des managers — réglage « voient toute l'entreprise »", () => {
  const manager = { role: "MANAGER" as const, managersVoientTout: true };
  const managerSansReglage = { role: "MANAGER" as const };

  test("sans le réglage, la portée reste celle de l'équipe", () => {
    expect(portee(managerSansReglage, "CRM")).toBe("EQUIPE");
    expect(portee({ role: "MANAGER", managersVoientTout: false }, "FACTURATION")).toBe("EQUIPE");
    expect(portee("MANAGER", "CRM")).toBe("EQUIPE");
  });

  test("avec le réglage, les modules métier passent à toute l'entreprise", () => {
    for (const m of MODULES_OUVERTS_AUX_MANAGERS) {
      // Un module que le Manager ne couvre pas en « équipe » (déjà TOUT, par exemple) ne change pas.
      expect(["TOUT", "EQUIPE"]).toContain(portee(managerSansReglage, m));
      expect(portee(manager, m)).toBe("TOUT");
    }
  });

  test("la RH, le recrutement et la messagerie gardent la portée de l'équipe", () => {
    for (const m of ["RH", "RECRUTEMENT", "MESSAGERIE"] as Module[]) expect(portee(manager, m)).toBe("EQUIPE");
  });

  test("les droits ne changent pas : pas de suppression, pas de comptabilité, pas de paramètres", () => {
    expect(peut(manager, "CRM", "SUPPRIMER")).toBe(false);
    expect(peut(manager, "COMPTABILITE", "VOIR")).toBe(false);
    expect(peut(manager, "PARAMETRES", "MODIFIER")).toBe(false);
    expect(portee(manager, "COMPTABILITE")).toBe("PROPRE");
    expect(portee(manager, "PARAMETRES")).toBe("PROPRE");
  });

  test("un Employé n'est jamais élargi, même si le réglage est présent sur son sujet", () => {
    expect(portee({ role: "EMPLOYE", managersVoientTout: true }, "CRM")).toBe("PROPRE");
    expect(portee({ role: "EMPLOYE", managersVoientTout: true }, "FACTURATION")).toBe("PROPRE");
  });

  test("un module fermé par l'Administrateur reste fermé, même avec le réglage", () => {
    const restreint = { role: "MANAGER" as const, managersVoientTout: true, modulesAutorises: ["PROJETS"] as Module[] };
    expect(peut(restreint, "CRM", "VOIR")).toBe(false);
    expect(portee(restreint, "CRM")).toBe("PROPRE");
    expect(portee(restreint, "PROJETS")).toBe("TOUT");
  });
});
