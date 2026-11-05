import { describe, it, expect } from "vitest";
import { peut, portee, MATRICE_PERMISSIONS, type Module } from "../src/lib/permissions";
import { filtrerModulesAutorises, listeAEnregistrer, modulesDeBase, modulesRestreignables } from "../src/lib/modules-libelles";

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
    for (const nomModule of Object.keys(MATRICE_PERMISSIONS.MANAGER) as Module[]) {
      expect(peut(manager, nomModule, "VOIR")).toBe(false);
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

// Un employé (stagiaire et prestataire compris) n'a que sa fiche, ses tâches et le chat, plus les modules que l'Administrateur lui accorde.
describe("socle de l'Employé : fiche, tâches, chat", () => {
  const socle: Module[] = ["RH", "PROJETS", "MESSAGERIE"];

  it("le socle reste ouvert même si la liste de l'Administrateur est vide ou ne le contient pas", () => {
    for (const modulesAutorises of [[], ["DOCUMENTS"]] as Module[][]) {
      const employe = { role: "EMPLOYE" as const, modulesAutorises };
      for (const m of socle) expect(peut(employe, m, "VOIR")).toBe(true);
    }
  });

  it("un Employé sans module accordé n'ouvre aucun autre module, même ceux que son rôle permet", () => {
    const employe = { role: "EMPLOYE" as const, modulesAutorises: [...socle] };
    for (const m of ["CRM", "FACTURATION", "DOCUMENTS", "ACHATS", "PRODUITS", "ANNONCES", "MARKETING", "SUPPORT", "RECRUTEMENT"] as Module[]) {
      expect(peut(employe, m, "VOIR")).toBe(false);
    }
  });

  it("un module accordé s'ouvre avec les droits du rôle, pas plus", () => {
    const employe = { role: "EMPLOYE" as const, modulesAutorises: [...socle, "DOCUMENTS"] as Module[] };
    expect(peut(employe, "DOCUMENTS", "VOIR")).toBe(true);
    expect(peut(employe, "DOCUMENTS", "SUPPRIMER")).toBe(false);
  });

  it("le socle ne concerne que l'Employé : un Manager est restreint par sa liste, sans socle imposé", () => {
    const manager = { role: "MANAGER" as const, modulesAutorises: ["CRM"] as Module[] };
    expect(peut(manager, "MESSAGERIE", "VOIR")).toBe(false);
    expect(modulesDeBase("MANAGER")).toEqual([]);
    expect(modulesDeBase("EMPLOYE")).toEqual(socle);
  });

  it("la liste enregistrée d'un Employé est toujours explicite et contient le socle ; celle d'un Manager complet reste « sans restriction »", () => {
    expect(listeAEnregistrer("EMPLOYE", [])).toEqual(socle);
    expect(listeAEnregistrer("EMPLOYE", ["CRM", "RH"])).toEqual(["RH", "PROJETS", "MESSAGERIE", "CRM"]);
    expect(listeAEnregistrer("EMPLOYE", modulesRestreignables("EMPLOYE"))).not.toBeNull();
    expect(listeAEnregistrer("MANAGER", modulesRestreignables("MANAGER"))).toBeNull();
    expect(listeAEnregistrer("MANAGER", ["CRM"])).toEqual(["CRM"]);
  });
});
