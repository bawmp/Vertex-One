import { describe, test, expect } from "vitest";
import { gabaritDemandeSuppressionDocument } from "@/lib/email/gabarits";

describe("Email d'alerte — demande de suppression de document", () => {
  const lien = "https://exemple.cm/app/documents";

  test("nomme le demandeur et le document, et rappelle que rien n'est supprimé avant validation", () => {
    const { subject, html } = gabaritDemandeSuppressionDocument({ demandeur: "Marie Demandeuse", documentNom: "contrat.pdf", motif: "Doublon", lien });
    expect(subject).toMatch(/suppression/i);
    expect(html).toContain("Marie Demandeuse");
    expect(html).toContain("contrat.pdf");
    expect(html).toContain("Doublon");
    expect(html).toContain("Rien n'est supprimé tant que vous n'avez pas validé");
    expect(html).toContain(lien);
  });

  test("échappe tout texte saisi par un utilisateur (nom, motif, nom de fichier)", () => {
    const { html } = gabaritDemandeSuppressionDocument({
      demandeur: '<img src=x onerror="alert(1)">',
      documentNom: "<b>fichier</b>.pdf",
      motif: '<a href="https://pirate.example">cliquez</a>',
      lien,
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>fichier");
    expect(html).not.toContain('<a href="https://pirate.example">');
    expect(html).toContain("&lt;img");
  });

  test("un document sensible n'est jamais nommé dans l'email", () => {
    const { html } = gabaritDemandeSuppressionDocument({ demandeur: "Marie", documentNom: null, motif: null, lien: "https://exemple.cm/app/contacts/c1" });
    expect(html).toContain("une pièce privée");
    expect(html).not.toContain("Motif indiqué");
  });
});
