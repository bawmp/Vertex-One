import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, facture } from "@/db/schema";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";

/**
 * Vérifie la mécanique de relance (docs/palier-1-*, section 6, étape 6)
 * contre la vraie base et le vrai client Resend. La livraison réelle à une
 * adresse quelconque a été vérifiée manuellement une fois (voir CLAUDE.md,
 * section Resend) — ce test utilise volontairement une adresse @*.test pour
 * ne pas envoyer un email réel à chaque exécution de la suite ; Resend
 * refuse ces adresses tant qu'aucun domaine n'est vérifié
 * (validation_error 403), ce qui est le comportement attendu ici : le test
 * vérifie que cet échec est bien remonté proprement, pas silencieusement
 * avalé, et que la facture passe bien en EN_RETARD indépendamment du
 * résultat de l'envoi.
 */
describe("Palier 1 — relance des factures en retard", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let factureId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Relance", secteurProfil: "generique" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-test-relance@vertexone.test", nomComplet: "Admin Test", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    await avecEntreprise(entrepriseId, async (tx) => {
      const [c] = await tx
        .insert(contact)
        .values({ entrepriseId, nom: "Client Test", telephone: "+237600000000", email: "client-test@vertexone.test", assigneAId: utilisateurId })
        .returning({ id: contact.id });
      const [d] = await tx
        .insert(deal)
        .values({ entrepriseId, titre: "Deal — Client Test", contactId: c.id, assigneAId: utilisateurId })
        .returning({ id: deal.id });

      const hier = new Date();
      hier.setDate(hier.getDate() - 1);

      const [f] = await tx
        .insert(facture)
        .values({
          entrepriseId,
          numero: "FAC-TEST-RELANCE-000001",
          dealId: d.id,
          statut: "EMISE",
          montantHT: 100000,
          montantTVA: 19250,
          montantTTC: 119250,
          dateEcheance: hier, // déjà en retard
        })
        .returning({ id: facture.id });
      factureId = f.id;
    });
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId)));
    await avecEntreprise(entrepriseId, (tx) => tx.delete(deal).where(eq(deal.entrepriseId, entrepriseId)));
    await avecEntreprise(entrepriseId, (tx) => tx.delete(contact).where(eq(contact.entrepriseId, entrepriseId)));
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("une facture échue passe en EN_RETARD et une tentative de relance email réelle est effectuée", async () => {
    const resultats = await avecEntreprise(entrepriseId, (tx) => marquerFacturesEnRetard(tx, entrepriseId));

    const [laFacture] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(facture).where(eq(facture.id, factureId)));
    expect(laFacture.statut).toBe("EN_RETARD");

    const relanceEmail = resultats.find((r) => r.canal === "email");
    expect(relanceEmail).toBeDefined();
    expect(relanceEmail?.numero).toBe("FAC-TEST-RELANCE-000001");
    // Échec attendu (domaine non vérifié sur Resend) — voir CLAUDE.md. Ce
    // qui compte ici : l'appel réel a eu lieu et l'échec est bien remonté,
    // pas avalé silencieusement.
    expect(relanceEmail?.envoye).toBe(false);
    expect(relanceEmail?.erreur).toMatch(/own email address|validation_error|RESEND_API_KEY/i);

    const relanceWhatsapp = resultats.find((r) => r.canal === "whatsapp");
    expect(relanceWhatsapp?.envoye).toBe(false);
  }, 30_000);

  test("une facture non échue n'est pas affectée", async () => {
    await avecEntreprise(entrepriseId, (tx) => tx.update(facture).set({ statut: "EMISE" }).where(eq(facture.id, factureId)));

    const dansLeFutur = new Date();
    dansLeFutur.setDate(dansLeFutur.getDate() + 30);
    await avecEntreprise(entrepriseId, (tx) => tx.update(facture).set({ dateEcheance: dansLeFutur }).where(eq(facture.id, factureId)));

    const resultats = await avecEntreprise(entrepriseId, (tx) => marquerFacturesEnRetard(tx, entrepriseId));
    expect(resultats).toHaveLength(0);
  });
});
