import { describe, expect, test } from "vitest";
import { composerEmailInvitation } from "@/lib/invitations/envoi";

describe("Email d'invitation de l'équipe", () => {
  const base = { nomEntreprise: "Agence Soleil", nomInvitant: "Awa Ndiaye", lien: "https://app.exemple.test/invitation/ABC123", dureeHeures: 72 };

  test("un collaborateur reçoit le lien, son rôle, la consigne de connexion par email et la durée de validité", () => {
    const { subject, html } = composerEmailInvitation({ ...base, role: "MANAGER" });
    expect(subject).toContain("Agence Soleil");
    expect(html).toContain("https://app.exemple.test/invitation/ABC123");
    expect(html).toContain("Manager");
    expect(html).toContain("Awa Ndiaye");
    expect(html).toContain("72 heures");
    expect(html).toContain("cette adresse email");
  });

  test("un employé est présenté comme Employé, un client du portail reçoit un accès à son espace client", () => {
    expect(composerEmailInvitation({ ...base, role: "EMPLOYE" }).html).toContain("Employé");
    const portail = composerEmailInvitation({ ...base, role: "CLIENT" });
    expect(portail.subject).toContain("espace client");
    expect(portail.html).not.toContain("Manager");
  });

  test("les noms saisis par un utilisateur sont échappés, jamais injectés dans le HTML ni dans le sujet", () => {
    const { subject, html } = composerEmailInvitation({ ...base, nomEntreprise: "<img src=x onerror=alert(1)>\nBcc: x", nomInvitant: "<script>alert(1)</script>", role: "EMPLOYE" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(subject).not.toContain("\n");
  });
});
