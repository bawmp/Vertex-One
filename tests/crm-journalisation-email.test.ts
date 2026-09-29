import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, interaction } from "@/db/schema";
import { journaliserEmailEnvoye } from "@/lib/crm/journaliser-email";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/**
 * journaliserEmailEnvoye() (src/lib/crm/journaliser-email.ts) est appelée par envoyerDevis/envoyerFacture
 * (utilisateur humain), marquerFacturesEnRetard et la confirmation de facture après acceptation publique d'un
 * devis (aucun utilisateur, auteurId nul) — voir plan du 2026-09-29. Ces tests vérifient l'insertion elle-même,
 * pas les Server Actions qui l'appellent (session/redirect hors de portée d'un test, patron déjà établi dans ce
 * dépôt).
 */
describe("CRM — journalisation des emails envoyés comme interaction", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nomEntreprise = `TEST JournalEmail ${suffixe}`;
  let entrepriseId: string;
  let utilisateurId: string;
  let contactId: string;

  beforeAll(async () => {
    const [ent] = await db.insert(entreprise).values({ nom: nomEntreprise, secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = ent.id;
    const [u] = await db.insert(utilisateur).values({ entrepriseId, email: `admin-journalemail-${suffixe}@vertexone.test`, nomComplet: "Admin Test", role: "ADMIN" }).returning({ id: utilisateur.id });
    utilisateurId = u.id;
    const [c] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(contact).values({ entrepriseId, nom: "Client Test", telephone: "+237690000000", assigneAId: utilisateurId }).returning({ id: contact.id })
    );
    contactId = c.id;
  }, 60_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nomEntreprise);
  }, 60_000);

  test("un envoi déclenché par un utilisateur (devis/facture/campagne) journalise avec son auteurId", async () => {
    await avecEntreprise(entrepriseId, (tx) => journaliserEmailEnvoye(tx, { entrepriseId, contactId, auteurId: utilisateurId, sujet: "Votre devis DEV-0001" }));

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(interaction).where(eq(interaction.contactId, contactId)));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].type).toBe("email");
    expect(lignes[0].contenu).toBe("Votre devis DEV-0001");
    expect(lignes[0].auteurId).toBe(utilisateurId);
  });

  test("un envoi automatique (relance, confirmation après acceptation publique) journalise avec auteurId nul", async () => {
    await avecEntreprise(entrepriseId, (tx) => journaliserEmailEnvoye(tx, { entrepriseId, contactId, auteurId: null, sujet: "Relance : facture FAC-0002" }));

    const lignes = await avecEntreprise(entrepriseId, (tx) => tx.select().from(interaction).where(eq(interaction.contactId, contactId)));
    const relance = lignes.find((l) => l.contenu === "Relance : facture FAC-0002");
    expect(relance).toBeDefined();
    expect(relance?.auteurId).toBeNull();
  });

  test("fuite : une entreprise fictive B ne voit pas les interactions email d'un contact d'une entreprise A", async () => {
    const [autreEntreprise] = await db.insert(entreprise).values({ nom: `TEST JournalEmail Autre ${suffixe}`, secteurProfil: "agence" }).returning({ id: entreprise.id });
    try {
      const lignesVuesParB = await avecEntreprise(autreEntreprise.id, (tx) => tx.select().from(interaction).where(eq(interaction.contactId, contactId)));
      expect(lignesVuesParB).toHaveLength(0);
    } finally {
      await db.delete(entreprise).where(eq(entreprise.id, autreEntreprise.id));
    }
  });
});
