import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, utilisateur, prospect, facture, paiement } from "@/db/schema";
import { parserCsvReleve, suggererCorrespondances, confirmerRapprochement } from "@/lib/comptabilite/rapprochement";

describe("Palier 4 — rapprochement bancaire", () => {
  test("parserCsvReleve ignore les lignes d'en-tête et les lignes invalides", () => {
    const csv = "date,libelle,montant\n2026-01-15,Virement Client X,119250\ninvalide\n2026-01-16,Virement Client Y,50000";
    const lignes = parserCsvReleve(csv);

    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toEqual({ date: new Date("2026-01-15"), libelle: "Virement Client X", montant: 119250 });
    expect(lignes[1].montant).toBe(50000);
  });

  describe("suggererCorrespondances (base réelle)", () => {
    let entrepriseId: string;
    let utilisateurId: string;
    let paiementDansLaFenetreId: string;
    let paiementHorsFenetreId: string;

    beforeAll(async () => {
      const [e] = await db.insert(entreprise).values({ nom: "TEST P4 Rapprochement Kiro", secteurProfil: "agence" }).returning({ id: entreprise.id });
      entrepriseId = e.id;

      const [u] = await db
        .insert(utilisateur)
        .values({ entrepriseId, email: "admin-p4-rapprochement@vertexone.test", nomComplet: "Admin Rapprochement", role: "ADMIN" })
        .returning({ id: utilisateur.id });
      utilisateurId = u.id;

      const dateProche = new Date("2026-01-14");
      const dateLointaine = new Date("2026-06-01");

      const [pDansFenetre, pHorsFenetre] = await avecEntreprise(entrepriseId, async (tx) => {
        const [pr] = await tx
          .insert(prospect)
          .values({ entrepriseId, nom: "Client Rapprochement", telephone: "+237600000007", assigneAId: utilisateurId })
          .returning({ id: prospect.id });

        const [f1] = await tx
          .insert(facture)
          .values({ entrepriseId, numero: "FAC-TEST-RAPPR-0001", prospectId: pr.id, statut: "PAYEE", montantHT: 100000, montantTVA: 19250, montantTTC: 119250, dateEcheance: dateProche })
          .returning({ id: facture.id });
        const [pay1] = await tx
          .insert(paiement)
          .values({ entrepriseId, factureId: f1.id, montant: 119250, moyenPaiement: "manuel", datePaiement: dateProche })
          .returning({ id: paiement.id });

        const [f2] = await tx
          .insert(facture)
          .values({ entrepriseId, numero: "FAC-TEST-RAPPR-0002", prospectId: pr.id, statut: "PAYEE", montantHT: 42017, montantTVA: 7983, montantTTC: 50000, dateEcheance: dateLointaine })
          .returning({ id: facture.id });
        const [pay2] = await tx
          .insert(paiement)
          .values({ entrepriseId, factureId: f2.id, montant: 50000, moyenPaiement: "manuel", datePaiement: dateLointaine })
          .returning({ id: paiement.id });

        return [pay1.id, pay2.id];
      });
      paiementDansLaFenetreId = pDansFenetre;
      paiementHorsFenetreId = pHorsFenetre;
    }, 30_000);

    afterAll(async () => {
      await avecEntreprise(entrepriseId, async (tx) => {
        await tx.delete(paiement).where(eq(paiement.entrepriseId, entrepriseId));
        await tx.delete(facture).where(eq(facture.entrepriseId, entrepriseId));
        await tx.delete(prospect).where(eq(prospect.entrepriseId, entrepriseId));
      });
      await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
      await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
    }, 30_000);

    test("propose le paiement dans la fenêtre de 5 jours, ignore celui hors fenêtre", async () => {
      const ligneReleve = [{ date: new Date("2026-01-15"), libelle: "Virement reçu", montant: 119250 }];

      const suggestions = await avecEntreprise(entrepriseId, (tx) => suggererCorrespondances(tx, entrepriseId, ligneReleve));

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].paiementsProbables.map((p) => p.id)).toContain(paiementDansLaFenetreId);
      expect(suggestions[0].paiementsProbables.map((p) => p.id)).not.toContain(paiementHorsFenetreId);
    });

    test("ne propose plus un paiement déjà rapproché", async () => {
      await avecEntreprise(entrepriseId, (tx) => confirmerRapprochement(tx, paiementDansLaFenetreId));

      const ligneReleve = [{ date: new Date("2026-01-15"), libelle: "Virement reçu", montant: 119250 }];
      const suggestions = await avecEntreprise(entrepriseId, (tx) => suggererCorrespondances(tx, entrepriseId, ligneReleve));

      expect(suggestions[0].paiementsProbables).toHaveLength(0);
    });
  });
});
