import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { devis, ligneDevis, facture, ligneFacture, contact, compteClient, entreprise } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

export type ClientPourPDF = { nom: string; societeCliente: string | null; niu: string | null; telephone: string; email: string | null };

/**
 * Construit l'objet "client" attendu par DocumentCommercialPDF à partir du
 * Contact (+ Compte optionnel) directement porté par le document — découplage
 * Books/CRM (échange du 2026-09-07) : ne passe plus par un Deal intermédiaire,
 * contactId/compteId sont désormais lus directement sur le Devis/la Facture.
 * Le NIU vit sur le Compte (donnée de société), pas sur le Contact (donnée
 * de personne).
 */
async function construireClientPourPDF(tx: TransactionDrizzle, contactId: string | null, compteId: string | null): Promise<ClientPourPDF | null> {
  if (!contactId) return null;

  const [leContact] = await tx.select().from(contact).where(eq(contact.id, contactId));
  if (!leContact) return null;

  const [leCompte] = compteId ? await tx.select().from(compteClient).where(eq(compteClient.id, compteId)) : [null];

  return {
    nom: leContact.nom,
    societeCliente: leCompte?.nom ?? null,
    niu: leCompte?.niu ?? null,
    telephone: leContact.telephone,
    email: leContact.email,
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
  if (visibles !== "TOUT" && (!d.assigneAId || !visibles.includes(d.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, d.contactId, d.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { devis: d, lignes, client, entreprise: monEntreprise };
}

export async function recupererFacturePourPDF(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, factureId: string) {
  const [f] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!f) return null;

  const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
  if (visibles !== "TOUT" && (!f.assigneAId || !visibles.includes(f.assigneAId))) return null;
  const client = await construireClientPourPDF(tx, f.contactId, f.compteId);
  if (!client) return null;

  const [lignes, [monEntreprise]] = await Promise.all([
    tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, factureId)),
    tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
  ]);

  return { facture: f, lignes, client, entreprise: monEntreprise };
}
