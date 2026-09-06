import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, modeleEmail } from "@/db/schema";
import { recupererModele, interpoler, corpsVersHtml, modeleParDefaut } from "@/lib/email/modeles";

describe("Palier 1 — modèles d'email personnalisables", () => {
  test("interpoler remplace les variables connues et laisse les inconnues intactes", () => {
    const resultat = interpoler("Bonjour {{client}}, montant {{montant}}, {{inconnue}}", {
      client: "Garage Mbarga",
      montant: "119 250 FCFA",
    });
    expect(resultat).toBe("Bonjour Garage Mbarga, montant 119 250 FCFA, {{inconnue}}");
  });

  test("corpsVersHtml transforme chaque ligne en paragraphe, y compris les lignes vides", () => {
    const html = corpsVersHtml("Bonjour,\n\nCordialement");
    expect(html).toBe("<p>Bonjour,</p>\n<p>&nbsp;</p>\n<p>Cordialement</p>");
  });

  describe("recupererModele (base réelle)", () => {
    let entrepriseId: string;

    beforeAll(async () => {
      const [e] = await db.insert(entreprise).values({ nom: "TEST Modèles Email", secteurProfil: "generique" }).returning({ id: entreprise.id });
      entrepriseId = e.id;
    }, 30_000);

    afterAll(async () => {
      await avecEntreprise(entrepriseId, (tx) => tx.delete(modeleEmail).where(eq(modeleEmail.entrepriseId, entrepriseId)));
      await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
    }, 30_000);

    test("retombe sur le modèle par défaut quand aucune ligne n'existe pour cette entreprise", async () => {
      const modele = await avecEntreprise(entrepriseId, (tx) => recupererModele(tx, entrepriseId, "ENVOI_DEVIS"));
      expect(modele).toEqual(modeleParDefaut("ENVOI_DEVIS"));
    });

    test("retourne le modèle personnalisé une fois enregistré, sans affecter l'autre type", async () => {
      await avecEntreprise(entrepriseId, (tx) =>
        tx.insert(modeleEmail).values({
          entrepriseId,
          type: "ENVOI_DEVIS",
          objet: "Objet personnalisé {{numero}}",
          corps: "Corps personnalisé pour {{client}}",
        })
      );

      const modeleDevis = await avecEntreprise(entrepriseId, (tx) => recupererModele(tx, entrepriseId, "ENVOI_DEVIS"));
      expect(modeleDevis).toEqual({ objet: "Objet personnalisé {{numero}}", corps: "Corps personnalisé pour {{client}}" });

      const modeleFacture = await avecEntreprise(entrepriseId, (tx) => recupererModele(tx, entrepriseId, "ENVOI_FACTURE"));
      expect(modeleFacture).toEqual(modeleParDefaut("ENVOI_FACTURE"));
    });
  });
});
