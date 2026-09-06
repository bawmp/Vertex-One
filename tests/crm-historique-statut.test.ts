import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, historiqueStatutDeal } from "@/db/schema";
import { enregistrerCreationDeal, changerStatutDealEtHistoriser } from "@/lib/crm/historique";

/**
 * Timeline du pipeline commercial (inspirée de Zoho CRM, échange du
 * 2026-09-06) — vérifie la logique de journalisation ET l'isolation RLS de
 * la nouvelle table, conformément à CLAUDE.md : "après chaque nouveau
 * module touchant à des données d'entreprise, un test délibéré doit
 * vérifier qu'une entreprise fictive ne peut techniquement pas accéder aux
 * données d'une autre."
 */
describe("CRM — historique des changements de statut du Deal", () => {
  let entrepriseId: string;
  let autreEntrepriseId: string;
  let utilisateurId: string;
  let dealId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Historique Statut Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
    const [autre] = await db.insert(entreprise).values({ nom: "TEST Historique Statut Mbarga", secteurProfil: "artisan" }).returning({ id: entreprise.id });
    entrepriseId = e.id;
    autreEntrepriseId = autre.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-historique-statut@vertexone.test", nomComplet: "Admin Historique", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    dealId = await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Historique", telephone: "+237600000020", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId, titre: "Deal — Client Historique", contactId: c.id, assigneAId: utilisateurId })
        .returning({ id: deal.id });
      return d.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      await tx.delete(historiqueStatutDeal).where(eq(historiqueStatutDeal.entrepriseId, entrepriseId));
      await tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId));
      await tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
    await db.delete(entreprise).where(eq(entreprise.id, autreEntrepriseId));
  }, 30_000);

  test("enregistrerCreationDeal journalise la création avec ancienStatut NULL", async () => {
    await avecEntreprise(entrepriseId, (tx) =>
      enregistrerCreationDeal(tx, { entrepriseId, dealId, statut: "QUALIFICATION", modifieParId: utilisateurId })
    );

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, dealId)));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].ancienStatut).toBeNull();
    expect(lignes[0].nouveauStatut).toBe("QUALIFICATION");
  });

  test("changerStatutDealEtHistoriser met à jour le deal et journalise l'ancien et le nouveau statut", async () => {
    const changement = await avecEntreprise(entrepriseId, (tx) =>
      changerStatutDealEtHistoriser(tx, { entrepriseId, dealId, nouveauStatut: "PROPOSITION", modifieParId: utilisateurId })
    );
    expect(changement).toBe(true);

    const [leDeal] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(deal).where(eq(deal.id, dealId)));
    expect(leDeal.statut).toBe("PROPOSITION");

    const lignes = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, dealId)).orderBy(historiqueStatutDeal.modifieLe)
    );
    expect(lignes).toHaveLength(2);
    expect(lignes[1].ancienStatut).toBe("QUALIFICATION");
    expect(lignes[1].nouveauStatut).toBe("PROPOSITION");
  });

  test("changerStatutDealEtHistoriser vers le même statut ne journalise rien (no-op)", async () => {
    const changement = await avecEntreprise(entrepriseId, (tx) =>
      changerStatutDealEtHistoriser(tx, { entrepriseId, dealId, nouveauStatut: "PROPOSITION", modifieParId: utilisateurId })
    );
    expect(changement).toBe(false);

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, dealId)));
    expect(lignes).toHaveLength(2); // toujours 2, pas 3
  });

  test("une entreprise ne voit pas l'historique de statut d'une autre", async () => {
    const lecture = await avecEntreprise(autreEntrepriseId, (tx) => tx.select().from(historiqueStatutDeal).where(eq(historiqueStatutDeal.dealId, dealId)));
    expect(lecture).toHaveLength(0);

    const lectureLarge = await avecEntreprise(autreEntrepriseId, (tx) => tx.select().from(historiqueStatutDeal));
    expect(lectureLarge.some((l) => l.dealId === dealId)).toBe(false);
  });
});
