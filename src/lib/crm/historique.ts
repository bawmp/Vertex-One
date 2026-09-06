import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { deal, historiqueStatutDeal, statutDeal } from "@/db/schema";

type StatutDeal = (typeof statutDeal.enumValues)[number];

/**
 * Premier point de la timeline du pipeline (inspirée du timeline de Deal
 * dans Zoho CRM, échange du 2026-09-06) — ancienStatut NULL marque la
 * création, pas un changement.
 */
export async function enregistrerCreationDeal(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; dealId: string; statut: StatutDeal; modifieParId: string }
): Promise<void> {
  await tx.insert(historiqueStatutDeal).values({
    entrepriseId: params.entrepriseId,
    dealId: params.dealId,
    ancienStatut: null,
    nouveauStatut: params.statut,
    modifieParId: params.modifieParId,
  });
}

/**
 * Met à jour le statut et journalise le changement dans la même transaction
 * — jamais l'un sans l'autre. Un statut identique au précédent n'écrit
 * aucune ligne (pas de bruit dans la timeline pour un no-op), et la fonction
 * retourne false pour que l'appelant sache qu'aucun changement réel n'a eu
 * lieu.
 */
export async function changerStatutDealEtHistoriser(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; dealId: string; nouveauStatut: StatutDeal; modifieParId: string }
): Promise<boolean> {
  const [avant] = await tx.select({ statut: deal.statut }).from(deal).where(eq(deal.id, params.dealId));
  if (!avant || avant.statut === params.nouveauStatut) return false;

  await tx.update(deal).set({ statut: params.nouveauStatut }).where(eq(deal.id, params.dealId));

  await tx.insert(historiqueStatutDeal).values({
    entrepriseId: params.entrepriseId,
    dealId: params.dealId,
    ancienStatut: avant.statut,
    nouveauStatut: params.nouveauStatut,
    modifieParId: params.modifieParId,
  });

  return true;
}
