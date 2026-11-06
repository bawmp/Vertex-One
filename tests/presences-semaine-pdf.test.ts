import { createElement } from "react";
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { FichePresenceSemainePDF } from "@/lib/pdf/fiche-presence-semaine";
import { joursDeSemaine } from "@/lib/rh/presences-commun";

describe("PDF de la fiche hebdomadaire", () => {
  it("se génère avec les sept jours", async () => {
    const jours = joursDeSemaine("2026-11-05");
    const cellules = jours.map((_, i) => ({ statut: (["PRESENT", "RETARD", "ABSENT", "CONGE", null, null, null] as const)[i], heureArrivee: i < 2 ? "08:00" : null, heureDepart: i < 2 ? "17:00" : null }));
    const cumul = { presents: 1, retards: 1, absents: 1, conges: 1, nonRenseignes: 0 };
    const fiche = { jours, mois: { debut: "2026-11-01", fin: "2026-11-30", joursEcoules: 5 }, gerant: { id: "g", nom: "Gérant Test" }, totaux: { presents: 1, retards: 1, absents: 1, conges: 1, effectif: 1 }, sections: [{ entrepriseId: "e", entrepriseNom: "TEST", lignes: [{ dossierRHId: "d", nom: "Jean Test", poste: "Comptable", cellules: [...cellules], presents: 1, retards: 1, absents: 1, conges: 1, cumul }] }] };
    const buf = await renderToBuffer(createElement(FichePresenceSemainePDF, { fiche, entreprise: { nom: "TEST", logoUrl: null, couleurMarque: null } }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
