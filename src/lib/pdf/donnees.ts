import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { devis, ligneDevis, facture, ligneFacture, deal, contact, compteClient, entreprise } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

export type ClientPourPDF = { nom: string; societeCliente: string | null; niu: string | null; telephone: string; email: string | null };

/**
 * Construit l'objet "client" attendu par DocumentCommercialPDF à partir du
 * Contact (+ Compte optionnel) associé au Deal — reconstruction
 * Leads/Contacts/Comptes/Deals (échange du 2026-09-06) : le NIU vit
 * désormais sur le Compte (donnée de société), pas sur le Contact (donnée
 * de personne).
 */
async function construireClientPourPDF(tx: TransactionDrizzle, dealId: string): Promise<{ client: ClientPourPDF; assigneAId: string } | null> {
  const [leDeal] = await tx.select({ contactId: deal.contactId, assigneAId: deal.assigneAId }).from(deal).where(eq(deal.id, dealId));
  if (!leDeal) return null;

  const [leContact] = await tx.select().from(contact).where(eq(contact.id, leDeal.contactId));
  if (!leContact) return null;

  const [leCompte] = leContact.compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, leContact.compteId)) : [null];

  return {
    assigneAId: leDeal.assigneAId,
    client: {
      nom: leContact.nom,
      societeCliente: leCompte?.nom ?? null,
      niu: leCompte?.niu ?? null,
      telephone: leContact.telephone,
      email: leContact.email,
    },
  };
}

/**
 * Extrait de la Route Handler PDF d'origine — réutilisé tel quel par
 * l'action d'envoi par email (elle a besoin exactement des mêmes données
 * pour générer la même pièce jointe), pour éviter de dupliquer la requête
 * et le contrôle de portée (idsVisibles).
 */
export async function recupererDevisPourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, devisId: string) {
  const [d] = await tx.select().from(devis).where(eq(devis.id, devisId));
  if (!d) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  const infoClient = await construireClientPourPDF(tx, d.dealId);
  if (!infoClient) return null;
  if (visibles !== "TOUT" && !visibles.includes(infoClient.assigneAId)) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { devis: d, lignes, client: infoClient.client, entreprise: monEntreprise };
}

export async function recupererFacturePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, factureId: string) {
  const [f] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!f) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  const infoClient = await construireClientPourPDF(tx, f.dealId);
  if (!infoClient) return null;
  if (visibles !== "TOUT" && !visibles.includes(infoClient.assigneAId)) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, factureId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { facture: f, lignes, client: infoClient.client, entreprise: monEntreprise };
}
