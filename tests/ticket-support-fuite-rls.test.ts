import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, categorieTicketSupport, ticketSupport, messageTicketSupport } from "@/db/schema";
import { peutVoirTicketSupport } from "@/lib/portail/acces";

/**
 * Test de fuite délibérée entre deux entreprises fictives — voir CLAUDE.md.
 * Vérifie aussi l'isolation par Contact individuel (pas seulement par
 * entreprise) : un Contact ne doit jamais voir le ticket d'un autre Contact
 * de la même entreprise, isolation qui n'est PAS portée par la RLS
 * (entrepriseId identique des deux côtés) mais par peutVoirTicketSupport()
 * en application.
 */
describe("Assistance client — isolation RLS entre entreprises et entre contacts", () => {
  let kiroId: string;
  let mbargaId: string;
  let adminKiroId: string;
  let adminMbargaId: string;
  let categorieMbargaId: string;
  let ticketMbargaId: string;
  let contactAId: string;
  let contactBId: string;
  let ticketContactAId: string;

  beforeAll(async () => {
    const [kiro] = await db.insert(entreprise).values({ nom: "TEST Support Agence Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [mbarga] = await db.insert(entreprise).values({ nom: "TEST Support Garage Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    kiroId = kiro.id;
    mbargaId = mbarga.id;

    const [uKiro] = await db.insert(utilisateur).values({ entrepriseId: kiroId, email: "admin-support-kiro@vertexone.test", nomComplet: "Admin Kiro", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [uMbarga] = await db.insert(utilisateur).values({ entrepriseId: mbargaId, email: "admin-support-mbarga@vertexone.test", nomComplet: "Admin Mbarga", role: "ADMIN" }).returning({ id: utilisateur.id });
    adminKiroId = uKiro.id;
    adminMbargaId = uMbarga.id;

    await avecEntreprise(mbargaId, async (tx) => {
      const [cat] = await tx.insert(categorieTicketSupport).values({ entrepriseId: mbargaId, nom: "Général", agentId: adminMbargaId }).returning({ id: categorieTicketSupport.id });
      categorieMbargaId = cat.id;

      const [cA] = await tx.insert(contact).values({ entrepriseId: mbargaId, nom: "Contact A", telephone: "699000001", assigneAId: adminMbargaId }).returning({ id: contact.id });
      const [cB] = await tx.insert(contact).values({ entrepriseId: mbargaId, nom: "Contact B", telephone: "699000002", assigneAId: adminMbargaId }).returning({ id: contact.id });
      contactAId = cA.id;
      contactBId = cB.id;

      const [t] = await tx
        .insert(ticketSupport)
        .values({ entrepriseId: mbargaId, categorieId: categorieMbargaId, contactId: contactAId, titre: "Souci moteur" })
        .returning({ id: ticketSupport.id });
      ticketMbargaId = t.id;
      ticketContactAId = t.id;
    });
  }, 30_000);

  afterAll(async () => {
    for (const id of [kiroId, mbargaId]) {
      await avecEntreprise(id, async (tx) => {
        await tx.delete(messageTicketSupport).where(eq(messageTicketSupport.entrepriseId, id));
        await tx.delete(ticketSupport).where(eq(ticketSupport.entrepriseId, id));
        await tx.delete(categorieTicketSupport).where(eq(categorieTicketSupport.entrepriseId, id));
        await tx.delete(contact).where(eq(contact.entrepriseId, id));
      });
    }
    await db.delete(utilisateur).where(eq(utilisateur.id, adminKiroId));
    await db.delete(utilisateur).where(eq(utilisateur.id, adminMbargaId));
    await db.delete(entreprise).where(eq(entreprise.id, kiroId));
    await db.delete(entreprise).where(eq(entreprise.id, mbargaId));
  }, 30_000);

  test("une entreprise ne voit pas, ne peut pas modifier, ni supprimer le ticket d'une autre", async () => {
    const lecture = await avecEntreprise(kiroId, (tx) => tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketMbargaId)));
    expect(lecture).toHaveLength(0);

    await avecEntreprise(kiroId, (tx) => tx.update(ticketSupport).set({ titre: "pirate" }).where(eq(ticketSupport.id, ticketMbargaId)));
    const [reel] = await avecEntreprise(mbargaId, (tx) => tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketMbargaId)));
    expect(reel.titre).not.toBe("pirate");

    await avecEntreprise(kiroId, (tx) => tx.delete(ticketSupport).where(eq(ticketSupport.id, ticketMbargaId)));
    const [toujoursLa] = await avecEntreprise(mbargaId, (tx) => tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketMbargaId)));
    expect(toujoursLa).toBeDefined();
  });

  test("le Contact B ne voit jamais le ticket du Contact A, même entreprise (isolation applicative, pas seulement RLS)", async () => {
    const [ticket] = await avecEntreprise(mbargaId, (tx) => tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketContactAId)));
    // La RLS (entrepriseId identique) laisserait passer cette lecture — c'est
    // peutVoirTicketSupport() qui doit refuser l'accès pour le Contact B.
    expect(peutVoirTicketSupport({ utilisateurId: "u-inexistant", entrepriseId: mbargaId, role: "CLIENT" }, contactBId, ticket)).toBe(false);
    expect(peutVoirTicketSupport({ utilisateurId: "u-inexistant", entrepriseId: mbargaId, role: "CLIENT" }, contactAId, ticket)).toBe(true);
  });

  test("un message ne peut jamais avoir zéro ou deux auteurs (contrainte CHECK)", async () => {
    await expect(
      avecEntreprise(mbargaId, (tx) => tx.insert(messageTicketSupport).values({ entrepriseId: mbargaId, ticketId: ticketMbargaId, contenu: "sans auteur" }))
    ).rejects.toThrow();

    await expect(
      avecEntreprise(mbargaId, (tx) =>
        tx.insert(messageTicketSupport).values({ entrepriseId: mbargaId, ticketId: ticketMbargaId, auteurUtilisateurId: adminMbargaId, auteurContactId: contactAId, contenu: "deux auteurs" })
      )
    ).rejects.toThrow();
  });
});
