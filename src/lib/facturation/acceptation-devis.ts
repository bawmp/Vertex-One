import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, devis, ligneDevis, facture, ligneFacture, contact } from "@/db/schema";
import { genererNumeroFacture } from "@/lib/facturation/numerotation";
import { creerProjetDepuisDevisAccepte } from "@/lib/projets/pont";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

/**
 * Devis accepté → facture créée automatiquement dans le même mouvement
 * (docs/palier-1-*, section 6, étape 4), numéro de facture généré à cet
 * instant précis (jamais avant), dans la même transaction que l'insertion — un
 * échec annule aussi l'incrémentation du compteur, donc jamais de trou.
 *
 * Partagée entre l'acceptation par un utilisateur de l'entreprise
 * (src/lib/actions/devis.ts) et l'acceptation par le client depuis son lien
 * public (src/lib/actions/client-documents.ts) : `parClient` enregistre alors
 * la preuve de la réponse (date, IP) et marque la facture comme déjà acceptée,
 * puisque le client vient d'accepter le devis dont elle découle.
 *
 * Renvoie l'identifiant de la facture créée, ou null si le devis est introuvable
 * ou déjà accepté (jamais de double facturation).
 */
export async function accepterDevisEtCreerFacture(
  tx: TransactionDrizzle,
  entrepriseId: string,
  devisId: string,
  parClient?: { ip: string | null }
): Promise<string | null> {
  const [leDevis] = await tx.select().from(devis).where(eq(devis.id, devisId));
  if (!leDevis || leDevis.statut === "ACCEPTE") return null;

  const [lignesDuDevis, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select({ secteurProfil: entreprise.secteurProfil }).from(entreprise).where(eq(entreprise.id, entrepriseId)),
  ]);
  if (!leDevis.contactId) return null; // intégrité référentielle violée — ne devrait jamais arriver

  const [leContact] = await tx.select({ nom: contact.nom }).from(contact).where(eq(contact.id, leDevis.contactId));

  await tx
    .update(devis)
    .set({ statut: "ACCEPTE", ...(parClient ? { reponseLe: new Date(), reponseIP: parClient.ip } : {}) })
    .where(eq(devis.id, devisId));

  const numero = await genererNumeroFacture(tx, entrepriseId);
  const dateEcheance = new Date();
  dateEcheance.setDate(dateEcheance.getDate() + 30);

  const [nouvelleFacture] = await tx
    .insert(facture)
    .values({
      entrepriseId: entrepriseId,
      numero,
      dealId: leDevis.dealId,
      contactId: leDevis.contactId,
      compteId: leDevis.compteId,
      assigneAId: leDevis.assigneAId,
      devisOrigineId: leDevis.id,
      montantHT: leDevis.montantHT,
      montantTVA: leDevis.montantTVA,
      montantTTC: leDevis.montantTTC,
      dateEcheance,
      ...(parClient ? { reponseClient: "ACCEPTEE", reponseClientLe: new Date() } : {}),
    })
    .returning({ id: facture.id });

  await tx.insert(ligneFacture).values(
    lignesDuDevis.map((l) => ({
      entrepriseId: entrepriseId,
      factureId: nouvelleFacture.id,
      produitId: l.produitId,
      designation: l.designation,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      tauxTVA: l.tauxTVA,
    }))
  );

  // Catalogue Produits/Tarifs (échange du 2026-09-07) — une vente facturée
  // diminue le stock des BIEN suivis, jamais au stade Devis (simple
  // intention, pas encore une transaction réalisée), voir schema.ts.
  await decrementerStockVente(tx, lignesDuDevis);

  // Palier 4, section 4 : la comptabilité se construit toute seule à
  // mesure que l'entreprise facture — jamais un écran de saisie séparé à
  // ouvrir pour ses ventes courantes. Génération non conditionnée au
  // forfait (comme le pont Dossier/Projet ci-dessous) : seule la
  // consultation des écritures est verrouillée au forfait Business.
  await genererEcrituresFactureEmise(tx, {
    id: nouvelleFacture.id,
    entrepriseId: entrepriseId,
    numero,
    dateEmission: new Date(),
    montantHT: leDevis.montantHT,
    montantTVA: leDevis.montantTVA,
    montantTTC: leDevis.montantTTC,
  });

  // Palier 2, section 3 : ouverture (ou réutilisation) du Dossier client
  // et création d'un nouveau Projet, dans la même transaction que la
  // facture — un échec de l'un annule l'autre, jamais de facture sans son
  // Projet de suivi ni l'inverse.
  await creerProjetDepuisDevisAccepte(tx, {
    entrepriseId: entrepriseId,
    contactId: leDevis.contactId,
    contactNom: leContact?.nom ?? "Client",
    secteurProfil: monEntreprise?.secteurProfil ?? "generique",
    devisId: leDevis.id,
    numeroDevis: leDevis.numero,
    // Celui qui a créé le devis (donc gagné le client), pas forcément
    // celui qui clique sur "Marquer accepté" — voir docs/palier-2-*, section 3.
    responsableId: leDevis.creeParId,
  });

  return nouvelleFacture.id;
}
