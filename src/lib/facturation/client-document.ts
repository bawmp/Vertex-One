import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { deal, contact } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";

export type ClientVenteResolu = {
  dealId: string | null;
  contactId: string;
  compteId: string | null;
  assigneAId: string;
};

/**
 * Découplage Books/CRM (échange du 2026-09-07) — résout le client d'un
 * document Ventes (Devis/Facture/Bon de commande/Facture récurrente/Reçu de
 * vente/Facture d'acompte) soit via un Deal existant (flux CRM historique,
 * comportement inchangé : contactId/compteId/assigneAId recopiés tels
 * quels), soit directement via un Contact (nouveau flux, sans jamais passer
 * par le pipeline commercial — voir src/app/app/contacts/[id]/page.tsx pour
 * le point d'entrée correspondant). Dans ce second cas, aucun sélecteur
 * "assigné à" dans le formulaire : le créateur devient propriétaire du
 * document, même simplification que depense()/bonCommandeAchat() côté
 * Achats.
 */
export async function resoudreClientVente(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  identifiants: { dealId?: string; contactId?: string }
): Promise<ClientVenteResolu | null> {
  if (identifiants.dealId) {
    const [leDeal] = await tx.select().from(deal).where(eq(deal.id, identifiants.dealId));
    if (!leDeal) return null;
    return { dealId: leDeal.id, contactId: leDeal.contactId, compteId: leDeal.compteId, assigneAId: leDeal.assigneAId };
  }

  if (identifiants.contactId) {
    const [leContact] = await tx.select().from(contact).where(eq(contact.id, identifiants.contactId));
    if (!leContact) return null;
    return { dealId: null, contactId: leContact.id, compteId: leContact.compteId, assigneAId: utilisateurConnecte.utilisateurId };
  }

  return null;
}

export type ClientVenteComparable = { contactId: string | null; compteId: string | null };

/**
 * Deux documents Ventes appartiennent au même client si leur Compte
 * coïncide (même société, contacts différents possibles), sinon si leur
 * Contact coïncide directement — garde-fou de appliquerAcompteSurFacture()
 * (remplace l'ancienne comparaison sur dealId, devenu optionnel).
 */
export function memeClientVente(a: ClientVenteComparable, b: ClientVenteComparable): boolean {
  if (a.compteId && b.compteId) return a.compteId === b.compteId;
  return a.contactId !== null && a.contactId === b.contactId;
}
