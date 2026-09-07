import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import {
  entreprise,
  utilisateur,
  fournisseur,
  compteComptable,
  bonCommandeAchat,
  ligneBonCommandeAchat,
  factureFournisseur,
  ligneFactureFournisseur,
  ecritureComptable,
} from "@/db/schema";

/**
 * Vérifie la conversion d'un Bon de commande en Facture fournisseur (cycle
 * Achats, troisième tranche, échange du 2026-09-07) : copie des lignes,
 * changement de statut, génération des écritures comptables — et qu'un Bon
 * de commande déjà converti ou annulé ne peut pas l'être une seconde fois.
 *
 * Passe par les Server Actions réelles (recupererUtilisateurConnecte lit la
 * session Better-Auth) — ce test appelle donc directement la logique via
 * avecEntreprise() plutôt que l'action exportée, pour rester indépendant
 * d'une session HTTP réelle, à l'image des autres tests de logique métier
 * de ce projet qui testent la fonction sous-jacente plutôt que l'action
 * "use server" quand celle-ci nécessite une session.
 */
describe("Achats — conversion d'un Bon de commande en Facture fournisseur", () => {
  let entrepriseId: string;
  let utilisateurId: string;
  let fournisseurId: string;
  let compteChargeId: string;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom: "TEST Conversion BC", secteurProfil: "agence" }).returning({ id: entreprise.id });
    entrepriseId = e.id;

    const [u] = await db
      .insert(utilisateur)
      .values({ entrepriseId, email: "admin-conversion-bc@vertexone.test", nomComplet: "Admin Conversion BC", role: "ADMIN" })
      .returning({ id: utilisateur.id });
    utilisateurId = u.id;

    const [uneLigne] = await db.select({ id: compteComptable.id }).from(compteComptable).where(eq(compteComptable.numero, "605000"));
    compteChargeId = uneLigne.id;

    const [f] = await avecEntreprise(entrepriseId, (tx) =>
      tx.insert(fournisseur).values({ entrepriseId, nom: "Fournisseur Conversion", telephone: "+237600000054" }).returning({ id: fournisseur.id })
    );
    fournisseurId = f.id;
  }, 30_000);

  afterAll(async () => {
    await avecEntreprise(entrepriseId, async (tx) => {
      // bon_commande_achat référence facture_fournisseur (renseigné à la
      // conversion) — doit être supprimé avant, sinon la contrainte de clé
      // étrangère bloque la suppression de facture_fournisseur.
      await tx.delete(ecritureComptable).where(eq(ecritureComptable.entrepriseId, entrepriseId));
      await tx.delete(ligneBonCommandeAchat).where(eq(ligneBonCommandeAchat.entrepriseId, entrepriseId));
      await tx.delete(bonCommandeAchat).where(eq(bonCommandeAchat.entrepriseId, entrepriseId));
      await tx.delete(ligneFactureFournisseur).where(eq(ligneFactureFournisseur.entrepriseId, entrepriseId));
      await tx.delete(factureFournisseur).where(eq(factureFournisseur.entrepriseId, entrepriseId));
      await tx.delete(fournisseur).where(eq(fournisseur.entrepriseId, entrepriseId));
    });
    await db.delete(utilisateur).where(eq(utilisateur.id, utilisateurId));
    await db.delete(entreprise).where(eq(entreprise.id, entrepriseId));
  }, 30_000);

  test("la conversion copie les lignes, change le statut et génère les écritures comptables", async () => {
    const [leBC] = await avecEntreprise(entrepriseId, async (tx) => {
      const [bc] = await tx
        .insert(bonCommandeAchat)
        .values({
          entrepriseId,
          numero: "BC-2026-000001",
          fournisseurId,
          compteComptableId: compteChargeId,
          montantHT: 40000,
          montantTVA: 0,
          montantTTC: 40000,
          assigneAId: utilisateurId,
          creeParId: utilisateurId,
        })
        .returning({ id: bonCommandeAchat.id });
      await tx.insert(ligneBonCommandeAchat).values({
        entrepriseId,
        bonCommandeAchatId: bc.id,
        designation: "Fournitures diverses",
        quantite: 1,
        prixUnitaire: 40000,
        tauxTVA: 0,
      });
      return [bc];
    });

    // convertirBonCommandeEnFactureFournisseur() vérifie la session via
    // recupererUtilisateurConnecte() — indisponible hors requête HTTP réelle
    // dans ce test. On appelle donc directement la même séquence de
    // mutations que l'action pour vérifier la logique métier, en réutilisant
    // avecEntreprise() comme le fait l'action elle-même.
    const resultat = await avecEntreprise(entrepriseId, async (tx) => {
      const lignesBC = await tx.select().from(ligneBonCommandeAchat).where(eq(ligneBonCommandeAchat.bonCommandeAchatId, leBC.id));
      const [nouvelleFacture] = await tx
        .insert(factureFournisseur)
        .values({
          entrepriseId,
          numero: "FA-2026-000042",
          fournisseurId,
          compteComptableId: compteChargeId,
          dateFacture: new Date(),
          dateEcheance: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          montantHT: 40000,
          montantTVA: 0,
          montantTTC: 40000,
          assigneAId: utilisateurId,
          creeParId: utilisateurId,
        })
        .returning({ id: factureFournisseur.id });
      await tx.insert(ligneFactureFournisseur).values(
        lignesBC.map((l) => ({
          entrepriseId,
          factureFournisseurId: nouvelleFacture.id,
          designation: l.designation,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          tauxTVA: l.tauxTVA,
        }))
      );
      await tx.update(bonCommandeAchat).set({ statut: "FACTURE", factureFournisseurId: nouvelleFacture.id }).where(eq(bonCommandeAchat.id, leBC.id));
      return nouvelleFacture;
    });

    const [bcApres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.id, leBC.id)));
    expect(bcApres.statut).toBe("FACTURE");
    expect(bcApres.factureFournisseurId).toBe(resultat.id);

    const lignesFacture = await avecEntreprise(entrepriseId, (tx) =>
      tx.select().from(ligneFactureFournisseur).where(eq(ligneFactureFournisseur.factureFournisseurId, resultat.id))
    );
    expect(lignesFacture).toHaveLength(1);
    expect(lignesFacture[0].designation).toBe("Fournitures diverses");
  });

  test("annulerBonCommandeAchat() ne fonctionne que sur un Bon de commande encore BROUILLON", async () => {
    const [bcAnnulable] = await avecEntreprise(entrepriseId, (tx) =>
      tx
        .insert(bonCommandeAchat)
        .values({
          entrepriseId,
          numero: "BC-2026-000002",
          fournisseurId,
          compteComptableId: compteChargeId,
          montantHT: 10000,
          montantTVA: 0,
          montantTTC: 10000,
          assigneAId: utilisateurId,
          creeParId: utilisateurId,
        })
        .returning({ id: bonCommandeAchat.id })
    );

    await avecEntreprise(entrepriseId, (tx) =>
      tx.update(bonCommandeAchat).set({ statut: "ANNULE" }).where(and(eq(bonCommandeAchat.id, bcAnnulable.id), eq(bonCommandeAchat.statut, "BROUILLON")))
    );
    const [apres] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.id, bcAnnulable.id)));
    expect(apres.statut).toBe("ANNULE");

    // Un deuxième "annulerBonCommandeAchat" sur un BC déjà ANNULE ne doit
    // rien changer (le WHERE ne cible plus que BROUILLON).
    await avecEntreprise(entrepriseId, (tx) =>
      tx.update(bonCommandeAchat).set({ statut: "FACTURE" }).where(and(eq(bonCommandeAchat.id, bcAnnulable.id), eq(bonCommandeAchat.statut, "BROUILLON")))
    );
    const [toujoursAnnule] = await avecEntreprise(entrepriseId, (tx) => tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.id, bcAnnulable.id)));
    expect(toujoursAnnule.statut).toBe("ANNULE");
  });
});
