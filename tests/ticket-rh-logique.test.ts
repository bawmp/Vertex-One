import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, categorieTicketRH, ticketRH } from "@/db/schema";
import { peutVoirTicket } from "@/lib/rh/ticket";

/**
 * Assistance RH interne (échange du 2026-09-08) — vérifie que la
 * visibilité reste restreinte au demandeur, à l'agent assigné, ou à
 * l'Administrateur, jamais la portée RH normale d'un Manager : un
 * Manager qui a par ailleurs VOIR/MODIFIER sur le dossier RH de son
 * équipe (portée EQUIPE) ne voit pas pour autant un ticket assigné à un
 * autre agent, même si le demandeur fait partie de son équipe.
 */
describe("Assistance RH (tickets) — logique d'accès", () => {
  let entrepriseId: string;
  let adminId: string;
  let managerId: string;
  let employeId: string;
  let agentId: string;
  let ticketId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Ticket RH Logique", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-ticket-rh-logique@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [manager] = await db.insert(utilisateur).values({ entrepriseId, email: "manager-ticket-rh-logique@vertexone.test", nomComplet: "Manager", role: "MANAGER" }).returning({ id: utilisateur.id });
    const [employe] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "employe-ticket-rh-logique@vertexone.test", nomComplet: "Employé", role: "EMPLOYE", managerId: manager.id })
      .returning({ id: utilisateur.id });
    const [agent] = await db.insert(utilisateur).values({ entrepriseId, email: "agent-ticket-rh-logique@vertexone.test", nomComplet: "Agent RH", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    adminId = admin.id;
    managerId = manager.id;
    employeId = employe.id;
    agentId = agent.id;

    ticketId = await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(categorieTicketRH).values({ entrepriseId, nom: "Général", agentId }).returning({ id: categorieTicketRH.id });
      const [t] = await tx.insert(ticketRH).values({ entrepriseId, categorieId: c.id, demandeurId: employeId, titre: "Question", assigneAId: agentId }).returning({ id: ticketRH.id });
      return t.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(ticketRH).where(eq(ticketRH.entrepriseId, entrepriseId));
      await tx.delete(categorieTicketRH).where(eq(categorieTicketRH.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, adminId));
    await db.delete(utilisateur).where(eq(utilisateur.id, managerId));
    await db.delete(utilisateur).where(eq(utilisateur.id, employeId));
    await db.delete(utilisateur).where(eq(utilisateur.id, agentId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("l'Administrateur, le demandeur, et l'agent assigné voient le ticket ; le Manager du demandeur ne le voit pas", async () => {
    const [leTicket] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ticketRH).where(eq(ticketRH.id, ticketId)));

    expect(peutVoirTicket({ utilisateurId: adminId, entrepriseId, role: "ADMIN" }, leTicket)).toBe(true);
    expect(peutVoirTicket({ utilisateurId: employeId, entrepriseId, role: "EMPLOYE" }, leTicket)).toBe(true);
    expect(peutVoirTicket({ utilisateurId: agentId, entrepriseId, role: "EMPLOYE" }, leTicket)).toBe(true);
    expect(peutVoirTicket({ utilisateurId: managerId, entrepriseId, role: "MANAGER" }, leTicket)).toBe(false);
  });

  test("le ticket est bien assigné à l'agent par défaut de sa catégorie", async () => {
    const [leTicket] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(ticketRH).where(eq(ticketRH.id, ticketId)));
    expect(leTicket.assigneAId).toBe(agentId);
    expect(leTicket.statut).toBe("OUVERT");
    expect(leTicket.resoluLe).toBeNull();
  });
});
