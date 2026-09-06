import { eq, and, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { prospect, statutProspect } from "@/db/schema";
import { dossiersSansProjetActif } from "@/lib/projets/indicateurs";

export type Segment = { statut?: string; sansProjetDepuisJours?: number };
export type ContactSegment = { id: string; nom: string; telephone: string; email: string | null };

/**
 * Docs/palier-6-*, section 2 : "le segment reste volontairement un simple
 * critère... plutôt qu'un constructeur de requêtes complexe". Deux critères
 * pris en charge, jamais combinés (un OR/AND arbitraire serait déjà le
 * "petit Creator" que la section met en garde de ne pas construire) :
 *
 * - { statut: "PERDU" } — tous les prospects dans cet état.
 * - { sansProjetDepuisJours: 90 } — approximé ici comme "Dossier actif sans
 *   projet en cours, ouvert depuis au moins N jours" (réutilise
 *   dossiersSansProjetActif() du Palier 2/6) : le modèle de données ne suit
 *   pas de date précise "depuis quand sans projet", seulement la date
 *   d'ouverture du Dossier — une approximation documentée, pas une mesure
 *   exacte de la durée d'inactivité.
 */
export async function resoudreSegment(tx: TransactionDrizzle, entrepriseId: string, segment: Segment): Promise<ContactSegment[]> {
  if (segment.statut && statutProspect.enumValues.includes(segment.statut as (typeof statutProspect.enumValues)[number])) {
    return tx
      .select({ id: prospect.id, nom: prospect.nom, telephone: prospect.telephone, email: prospect.email })
      .from(prospect)
      .where(and(eq(prospect.entrepriseId, entrepriseId), eq(prospect.statut, segment.statut as (typeof statutProspect.enumValues)[number])));
  }

  if (segment.sansProjetDepuisJours != null) {
    const seuil = new Date();
    seuil.setDate(seuil.getDate() - segment.sansProjetDepuisJours);

    const dossiers = await dossiersSansProjetActif(tx, entrepriseId);
    const idsProspects = dossiers.filter((d) => d.dateOuverture <= seuil).map((d) => d.prospectId);
    if (idsProspects.length === 0) return [];

    return tx
      .select({ id: prospect.id, nom: prospect.nom, telephone: prospect.telephone, email: prospect.email })
      .from(prospect)
      .where(inArray(prospect.id, idsProspects));
  }

  return [];
}
