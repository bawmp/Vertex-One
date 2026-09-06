import { describe, test, expect } from "vitest";
import { idExterneUtilisateur, idExterneCanal } from "@/lib/chat/client";

/**
 * Docs/palier-3-*, section 3 et 10 — "même si une erreur de code tentait
 * d'ajouter un utilisateur de Garage Mbarga à un canal d'Agence Kiro, les
 * identifiants ne se croiseraient jamais chez le prestataire". Ce test
 * simule exactement ce scénario : un même id brut d'utilisateur/de projet
 * (id auto-incrémenté ou collision improbable mais pas impossible côté
 * cuid2) utilisé par erreur par deux entreprises différentes ne doit
 * jamais produire le même identifiant externe.
 */
describe("Palier 3 — préfixage systématique par entrepriseId pour le prestataire de chat", () => {
  test("deux entreprises avec le même id d'utilisateur brut obtiennent des ids externes distincts", () => {
    const idUtilisateurBrut = "utilisateur-partage-par-erreur";

    const idKiro = idExterneUtilisateur("entreprise-kiro", idUtilisateurBrut);
    const idMbarga = idExterneUtilisateur("entreprise-mbarga", idUtilisateurBrut);

    expect(idKiro).not.toBe(idMbarga);
    expect(idKiro).toBe("entreprise-kiro__utilisateur-partage-par-erreur");
    expect(idMbarga).toBe("entreprise-mbarga__utilisateur-partage-par-erreur");
  });

  test("deux entreprises avec le même id de projet (ancre de canal) obtiennent des canaux externes distincts", () => {
    const idProjetBrut = "projet-partage-par-erreur";

    const canalKiro = idExterneCanal("entreprise-kiro", idProjetBrut);
    const canalMbarga = idExterneCanal("entreprise-mbarga", idProjetBrut);

    expect(canalKiro).not.toBe(canalMbarga);
  });

  test("le préfixe est toujours entrepriseId, jamais l'inverse — impossible de deviner l'id sans connaître l'entreprise cible", () => {
    const id = idExterneUtilisateur("entreprise-kiro", "u1");
    expect(id.startsWith("entreprise-kiro__")).toBe(true);
  });
});
