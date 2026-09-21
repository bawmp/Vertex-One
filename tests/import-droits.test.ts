import { describe, test, expect } from "vitest";
import type { UtilisateurConnecte } from "@/lib/session";
import type { Module } from "@/lib/permissions";
import { refusImport, typesImportables } from "@/lib/import/droits";

const utilisateur = (role: UtilisateurConnecte["role"], modulesAutorises: Module[] | null = null): UtilisateurConnecte => ({ utilisateurId: "u1", entrepriseId: "e1", role, modulesAutorises });

describe("Import — droits", () => {
  test("l'Administrateur peut tout importer", () => {
    expect(typesImportables(utilisateur("ADMIN")).sort()).toEqual(["CONTACTS", "DEVIS", "FACTURES", "NOTES", "PRODUITS", "PROJETS_TACHES"]);
  });

  test("les finances (devis, factures) et les notes privées restent à l'Administrateur, même pour un Manager qui peut créer des factures", () => {
    for (const role of ["MANAGER", "EMPLOYE"] as const) {
      expect(refusImport(utilisateur(role), "FACTURES")).toContain("Administrateur");
      expect(refusImport(utilisateur(role), "DEVIS")).toContain("Administrateur");
      expect(refusImport(utilisateur(role), "NOTES")).toContain("Administrateur");
    }
  });

  test("un client du portail n'importe rien", () => {
    expect(typesImportables(utilisateur("CLIENT"))).toEqual([]);
  });

  test("la restriction de modules posée par l'Administrateur s'applique : sans le module CRM, pas d'import de contacts", () => {
    const sansCrm = utilisateur("MANAGER", ["PROJETS"]);
    expect(refusImport(sansCrm, "CONTACTS")).toContain("droit");
    expect(refusImport(sansCrm, "PROJETS_TACHES")).toBeNull();
  });
});
