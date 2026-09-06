import { eq, and, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { deal, contact, statutDeal } from "@/db/schema";
import { dossiersSansProjetActif } from "@/lib/projets/indicateurs";

export type Segment = { statut?: string; sansProjetDepuisJours?: number };
export type ContactSegment = { id: string; nom: string; telephone: string; email: string | null };

/**
 * Docs/palier-6-*, section 2 : "le segment reste volontairement un simple
 * critère... plutôt qu'un constructeur de requêtes complexe". Deux critères
 * pris en charge, jamais combinés (un OR/AND arbitraire serait déjà le
 * "petit Creator" que la section met en garde de ne pas construire) :
 *
 * - { statut: "PERDU" } — tous les Deals à cette étape du pipeline
 *   (reconstruction Leads/Contacts/Comptes/Deals, échange du 2026-09-06 —
 *   le statut vit désormais sur le Deal, pas directement sur le Contact).
 * - { sansProjetDepuisJours: 90 } — approximé ici comme "Dossier actif sans
 *   projet en cours, ouvert depuis au moins N jours" (réutilise
 *   dossiersSansProjetActif() du Palier 2/6) : le modèle de données ne suit
 *   pas de date précise "depuis quand sans projet", seulement la date
 *   d'ouverture du Dossier — une approximation documentée, pas une mesure
 *   exacte de la durée d'inactivité.
 */
export async function resoudreSegment(tx: TransactionDrizzle, entrepriseId: string, segment: Segment): Promise<ContactSegment[]> {
  if (segment.statut && statutDeal.enumValues.includes(segment.statut as (typeof statutDeal.enumValues)[number])) {
    return tx
      .select({ id: contact.id, nom: contact.nom, telephone: contact.telephone, email: contact.email })
      .from(deal)
      .innerJoin(contact, eq(deal.contactId, contact.id))
      .where(and(eq(deal.entrepriseId, entrepriseId), eq(deal.statut, segment.statut as (typeof statutDeal.enumValues)[number])));
  }

  if (segment.sansProjetDepuisJours != null) {
    const seuil = new Date();
    seuil.setDate(seuil.getDate() - segment.sansProjetDepuisJours);

    const dossiers = await dossiersSansProjetActif(tx, entrepriseId);
    const idsContacts = dossiers.filter((d) => d.dateOuverture <= seuil).map((d) => d.contactId);
    if (idsContacts.length === 0) return [];

    return tx
      .select({ id: contact.id, nom: contact.nom, telephone: contact.telephone, email: contact.email })
      .from(contact)
      .where(inArray(contact.id, idsContacts));
  }

  return [];
}
