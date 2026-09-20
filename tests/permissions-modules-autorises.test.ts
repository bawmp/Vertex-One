import { describe, it, expect } from "vitest";
import { peut, portee, MATRICE_PERMISSIONS, type Module } from "../src/lib/permissions";
import { filtrerModulesAutorises, modulesRestreignables } from "../src/lib/modules-libelles";

// L'Administrateur choisit les modules d'un collaborateur : la liste ne fait que
// restreindre la matrice du rôle, jamais l'élargir.
describe("accès par module (utilisateur.modulesAutorises)", () => {
  it("un rôle seul garde exactement le comportement historique", () => {
    expect(peut("EMPLOYE", "CRM", "VOIR")).toBe(true);
    expect(peut("EMPLOYE", "COMPTABILITE", "VOIR")).toBe(false);
  });

  it("null/absent = aucune restriction supplémentaire", () => {
    expect(peut({ role: "EMPLOYE", modulesAutorises: null }, "CRM", "VOIR")).toBe(true);
    expect(peut({ role: "EMPLOYE" }, "CRM", "VOIR")).toBe(true);
  });

  it("un module absent de la liste est fermé, même pour une action que le rôle aurait", () => {
    const employe = { role: "EMPLOYE" as const, modulesAutorises: ["DOCUMENTS"] as Module[] };
    expect(peut(employe, "CRM", "VOIR")).toBe(false);
    expect(peut(employe, "CRM", "CREER")).toBe(false);
    expect(portee(employe, "CRM")).toBe("PROPRE");
  });

  it("un module présent garde les droits du rôle, pas plus", () => {
    const employe = { role: "EMPLOYE" as const, modulesAutorises: ["DOCUMENTS"] as Module[] };
    expect(peut(employe, "DOCUMENTS", "VOIR")).toBe(true);
    expect(peut(employe, "DOCUMENTS", "CREER")).toBe(true);
    expect(peut(employe, "DOCUMENTS", "SUPPRIMER")).toBe(false); // l'Employé ne supprime pas
  });

  it("figurer dans la liste n'accorde jamais un module que le rôle n'a pas", () => {
    const employe = { role: "EMPLOYE" as const, modulesAutorises: ["COMPTABILITE", "PARAMETRES"] as Module[] };
    expect(peut(employe, "COMPTABILITE", "VOIR")).toBe(false);
    expect(peut(employe, "PARAMETRES", "MODIFIER")).toBe(false);
  });

  it("l'Administrateur n'est jamais restreint", () => {
    expect(peut({ role: "ADMIN", modulesAutorises: [] }, "COMPTABILITE", "VOIR")).toBe(true);
    expect(peut({ role: "ADMIN", modulesAutorises: [] }, "PARAMETRES", "MODIFIER")).toBe(true);
  });

  it("une liste vide ferme tout module pour un Manager", () => {
    const manager = { role: "MANAGER" as const, modulesAutorises: [] as Module[] };
    for (const module of Object.keys(MATRICE_PERMISSIONS.MANAGER) as Module[]) {
      expect(peut(manager, module, "VOIR")).toBe(false);
    }
  });

  it("filtrerModulesAutorises ignore les valeurs inconnues ou hors périmètre du rôle", () => {
    const retenus = filtrerModulesAutorises("EMPLOYE", ["CRM", "COMPTABILITE", "PARAMETRES", "N_IMPORTE_QUOI", "DOCUMENTS"]);
    expect(retenus).toEqual(["CRM", "DOCUMENTS"]);
  });

  it("les Paramètres ne se choisissent jamais et ne figurent pas dans les modules restreignables", () => {
    expect(modulesRestreignables("MANAGER")).not.toContain("PARAMETRES");
    expect(modulesRestreignables("EMPLOYE")).not.toContain("COMPTABILITE");
  });
});
