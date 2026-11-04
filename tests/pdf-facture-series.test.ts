import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db, avecEntreprise } from "@/db/client";
import { contact, entreprise, facture, ligneFacture, numeroSerie, produit, utilisateur } from "@/db/schema";
import { recupererFacturePourPDF, recupererFacturePourClient } from "@/lib/pdf/donnees";
import { definirSuiviSerie, ajouterSeries } from "@/lib/produits/series";
import { decrementerStockVente } from "@/lib/produits/stock";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";
import type { UtilisateurConnecte } from "@/lib/session";
import { supprimerEntrepriseDeTest } from "./aide-nettoyage";

/** Les numéros de série vendus sont lus pour le PDF d'une facture (ligne par ligne) et le PDF se génère. */
describe("PDF de facture avec numéros de série — base réelle", () => {
  const suffixe = Math.random().toString(36).slice(2, 8);
  const nom = `TEST PdfSerie ${suffixe}`;
  let E: string;
  let u: string;
  let factureId = "";
  let admin: UtilisateurConnecte;

  beforeAll(async () => {
    const [e] = await db.insert(entreprise).values({ nom, secteurProfil: "commerce" }).returning({ id: entreprise.id });
    E = e.id;
    const [x] = await db.insert(utilisateur).values({ entrepriseId: E, email: `pdfs-${suffixe}@vertexone.test`, nomComplet: "Admin PDF", role: "ADMIN" }).returning({ id: utilisateur.id });
    u = x.id;
    admin = { utilisateurId: u, entrepriseId: E, role: "ADMIN", modulesAutorises: null } as unknown as UtilisateurConnecte;
    await avecEntreprise(E, async (tx) => {
      const [p] = await tx.insert(produit).values({ entrepriseId: E, type: "BIEN", nom: "Telephone", suiviStock: true, creeParId: u }).returning({ id: produit.id });
      await definirSuiviSerie(tx, E, p.id, true);
      await ajouterSeries(tx, E, u, p.id, "SN-A\nSN-B\nSN-C", "ENTREE");
      const [c] = await tx.insert(contact).values({ entrepriseId: E, nom: "Client PDF", telephone: "690111222", assigneAId: u }).returning({ id: contact.id });
      const [f] = await tx.insert(facture).values({ entrepriseId: E, numero: `FAC-${suffixe}`, contactId: c.id, assigneAId: u, montantHT: 20_000, montantTVA: 0, montantTTC: 20_000, dateEcheance: new Date(Date.now() + 86_400_000) }).returning({ id: facture.id });
      factureId = f.id;
      await tx.insert(ligneFacture).values({ entrepriseId: E, factureId: f.id, produitId: p.id, designation: "Telephone", quantite: 2, prixUnitaire: 10_000, tauxTVA: 0 });
      await decrementerStockVente(tx, E, [{ produitId: p.id, quantite: 2 }], { documentType: "FACTURE", documentId: f.id, utilisateurId: u });
    });
  }, 90_000);

  afterAll(async () => {
    await supprimerEntrepriseDeTest(nom);
  }, 120_000);

  test("les lignes portent leurs numéros de série, côté équipe et côté client ; le PDF se génère", async () => {
    const donnees = await avecEntreprise(E, (tx) => recupererFacturePourPDF(tx, admin, factureId));
    expect(donnees).not.toBeNull();
    expect(donnees!.lignes).toHaveLength(1);
    expect(donnees!.lignes[0].series).toEqual(["SN-A", "SN-B"]);
    const client = await avecEntreprise(E, (tx) => recupererFacturePourClient(tx, E, factureId));
    expect(client!.lignes[0].series).toEqual(["SN-A", "SN-B"]);
    const pdf = await rendreDocumentCommercialPDF({
      typeDocument: "FACTURE",
      numero: donnees!.facture.numero,
      dateEmission: donnees!.facture.dateEmission,
      dateEcheanceOuValidite: donnees!.facture.dateEcheance,
      labelDateSecondaire: "Date d'échéance",
      entreprise: donnees!.entreprise,
      client: donnees!.client,
      lignes: donnees!.lignes,
      montantHT: donnees!.facture.montantHT,
      montantTVA: donnees!.facture.montantTVA,
      montantTTC: donnees!.facture.montantTTC,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const restants = await avecEntreprise(E, (tx) => tx.select({ n: numeroSerie.numero }).from(numeroSerie));
    expect(restants).toHaveLength(3);
  }, 120_000);
});
