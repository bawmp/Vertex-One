import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, categorieTicketRH, ticketRH, messageTicketRH } from "@/db/schema";

/**
 * Test de fuite délibérée entre deux entreprises fictives, pour les trois
 * tables ajoutées avec l'assistance RH interne (categorie_ticket_rh,
 * ticket_rh, message_ticket_rh) — voir CLAUDE.md : "après chaque nouveau
 * module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("Assistance RH (tickets) — isolation RLS entre entreprises", () => {
  let kiroId: string;
  let mbargaId: string;
  let utilisateurKiroId: string;
  let utilisateurMbargaId: string;
  let categorieMbargaId: string;
  let ticketMbargaId: string;
  let messageMbargaId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Ticket RH Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Ticket RH Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db
      .insert(utilisateur)
      .values({ entrepriseId: kiroId, email: "admin-ticket-rh-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    const [uMbarga] = await db
      .insert(utilisateur)
      .values({ entrepriseId: mbargaId, email: "admin-ticket-rh-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurKiroId = uKiro.id;
    utilisateurMbargaId = uMbarga.id;

    const resultat = await avecEntreprise(mbargaId, async (tx) => {
      const [c] = await tx.insert(categorieTicketRH).values({ entrepriseId: mbargaId, nom: "Général", agentId: utilisateurMbargaId }).returning({ id: categorieTicketRH.id });
      const [t] = await tx
        .insert(ticketRH)
        .values({ entrepriseId: mbargaId, categorieId: c.id, demandeurId: utilisateurMbargaId, titre: "Question congé", assigneAId: utilisateurMbargaId })
        .returning({ id: ticketRH.id });
      const [m] = await tx
        .insert(messageTicketRH)
        .values({ entrepriseId: mbargaId, ticketId: t.id, auteurId: utilisateurMbargaId, contenu: "Bonjour" })
        .returning({ id: messageTicketRH.id });
      return { categorieId: c.id, ticketId: t.id, messageId: m.id };
    });
    categorieMbargaId = resultat.categorieId;
    ticketMbargaId = resultat.ticketId;
    messageMbargaId = resultat.messageId;
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(messageTicketRH).where(eq(messageTicketRH.entrepriseId, id));
        await tx.delete(ticketRH).where(eq(ticketRH.entrepriseId, id));
        await tx.delete(categorieTicketRH).where(eq(categorieTicketRH.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer la catégorie, le ticket, ni le message d'une autre", async () => {
    const categories = await avecEntreprise(kiroId, (tx) => tx.select().from(categorieTicketRH).where(eq(categorieTicketRH.id, categorieMbargaId)));
    expect(categories).toHaveLength(0);

    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(ticketRH).where(eq(ticketRH.id, ticketMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(ticketRH).set({ titre: "pirate" }).where(eq(ticketRH.id, ticketMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(ticketRH).where(eq(ticketRH.id, ticketMbargaId)));
    expect(reel.titre).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(ticketRH).where(eq(ticketRH.id, ticketMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(ticketRH).where(eq(ticketRH.id, ticketMbargaId)));
    expect(toujoursLa).toBeDefined();

    const messages = await avecEntreprise(kiroId, (tx) => tx.select().from(messageTicketRH).where(eq(messageTicketRH.id, messageMbargaId)));
    expect(messages).toHaveLength(0);
  });
});
