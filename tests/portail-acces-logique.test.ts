import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact } from "@/db/schema";
import { peutVoirTicketSupport, resoudreMonContact } from "@/lib/portail/acces";
import type { UtilisateurConnecte } from "@/lib/session";

describe("Portail — peutVoirTicketSupport (fonction pure)", () => {
  const ticket = { contactId: "contact-1", assigneAId: "agent-1" };

  test("l'Administrateur voit toujours", () => {
    const admin: UtilisateurConnecte = { utilisateurId: "autre", entrepriseId: "e", role: "ADMIN" };
    expect(peutVoirTicketSupport(admin, null, ticket)).toBe(true);
  });

  test("l'agent assigné voit son ticket", () => {
    const agent: UtilisateurConnecte = { utilisateurId: "agent-1", entrepriseId: "e", role: "EMPLOYE" };
    expect(peutVoirTicketSupport(agent, null, ticket)).toBe(true);
  });

  test("le Contact demandeur voit son propre ticket", () => {
    const client: UtilisateurConnecte = { utilisateurId: "u-client", entrepriseId: "e", role: "CLIENT" };
    expect(peutVoirTicketSupport(client, "contact-1", ticket)).toBe(true);
  });

  test("un Contact tiers ne voit pas le ticket d'un autre Contact", () => {
    const autreClient: UtilisateurConnecte = { utilisateurId: "u-autre-client", entrepriseId: "e", role: "CLIENT" };
    expect(peutVoirTicketSupport(autreClient, "contact-2", ticket)).toBe(false);
  });

  test("un Employé non assigné, sans Contact lié, ne voit pas le ticket", () => {
    const employe: UtilisateurConnecte = { utilisateurId: "u-employe", entrepriseId: "e", role: "EMPLOYE" };
    expect(peutVoirTicketSupport(employe, null, ticket)).toBe(false);
  });
});

describe("Portail — resoudreMonContact (base réelle)", () => {
  let entrepriseId: string;
  let clientId: string;
  let autreUtilisateurId: string;
  let contactLieId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Portail Acces", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    const [admin] = await db.insert(utilisateur).values({ entrepriseId, email: "admin-portail-acces@vertexone.test", nomComplet: "Admin", role: "ADMIN" }).returning({ id: utilisateur.id });
    const [client] = await db.insert(utilisateur).values({ entrepriseId, email: "client-portail-acces@vertexone.test", nomComplet: "Client", role: "CLIENT" }).returning({ id: utilisateur.id });
    const [autre] = await db.insert(utilisateur).values({ entrepriseId, email: "autre-portail-acces@vertexone.test", nomComplet: "Autre", role: "EMPLOYE" }).returning({ id: utilisateur.id });
    clientId = client.id;
    autreUtilisateurId = autre.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx.insert(contact).values({ entrepriseId, nom: "Contact Lié", telephone: "699000000", assigneAId: admin.id, utilisateurId: client.id }).returning({ id: contact.id });
      contactLieId = c.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId)));
    await db.delete(utilisateur).where(eq(utilisateur.entrepriseId, entrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("retrouve le Contact lié au compte CLIENT connecté", async () => {
    const utilisateurConnecte: UtilisateurConnecte = { utilisateurId: clientId, entrepriseId, role: "CLIENT" };
    const monContact = await avecEntreprise(entrepriseId, (tx) => resoudreMonContact(tx, utilisateurConnecte));
    expect(monContact?.id).toBe(contactLieId);
  });

  test("renvoie null pour un compte jamais lié à un Contact", async () => {
    const utilisateurConnecte: UtilisateurConnecte = { utilisateurId: autreUtilisateurId, entrepriseId, role: "EMPLOYE" };
    const monContact = await avecEntreprise(entrepriseId, (tx) => resoudreMonContact(tx, utilisateurConnecte));
    expect(monContact).toBeNull();
  });
});
