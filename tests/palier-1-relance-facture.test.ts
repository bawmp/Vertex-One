import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, contact, deal, facture } from "@/db/schema";
import { marquerFacturesEnRetard } from "@/lib/facturation/relance";

/**
 * Vérifie la mécanique de relance (docs/palier-1-*, section 6, étape 6)
 * contre la vraie base et le vrai client Resend. Depuis la vérification du
 * domaine vertexone.cm sur Resend (2026-09-19), l'expéditeur n'est plus le
 * bac à sable onboarding@resend.dev (qui refusait toute adresse hors
 * propriétaire du compte) mais notifications@vertexone.cm — Resend accepte
 * alors l'envoi vers n'importe quelle adresse syntaxiquement valide, y
 * compris une adresse @*.test qui n'existe pas réellement (l'API de Resend
 * ne vérifie pas l'existence du domaine destinataire à l'acceptation, un
 * éventuel rejet interviendrait plus tard, de façon asynchrone, hors du
 * périmètre de ce test). Bug réel trouvé en exécutant ce test après la
 * vérification du domaine : l'ancienne assertion (échec attendu) ne
 * correspondait plus à la réalité — voir CLAUDE.md, section Resend.
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
          contactId: c.id,
          assigneAId: utilisateurId,
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
    // Succès attendu : notifications@vertexone.cm (domaine vérifié) peut
    // envoyer à n'importe quelle adresse syntaxiquement valide, y compris
    // une adresse @*.test qui n'existe pas réellement — voir le commentaire
    // en tête de fichier.
    expect(relanceEmail?.envoye).toBe(true);
    expect(relanceEmail?.erreur).toBeUndefined();

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
