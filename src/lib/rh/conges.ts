import { eq, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossierRH, demandeConge } from "@/db/schema";

/**
 * Docs/palier-5-*, section 9, étape 2 : "mise à jour du solde de congés" au
 * moment de l'approbation, pas à la demande — un refus ou une demande encore
 * en attente ne doit jamais entamer le solde. Seul un congé payé décompte le
 * solde (maladie/sans solde/autre n'y touchent pas, cohérent avec leur nom).
 */
export async function approuverDemandeConge(tx: TransactionDrizzle, demandeId: string, approuveParId: string): Promise<void> {
  const [demande] = await tx.select().from(demandeConge).where(eq(demandeConge.id, demandeId));
  if (!demande || demande.statut !== "EN_ATTENTE") return;

  await tx.update(demandeConge).set({ statut: "APPROUVEE", approuveParId }).where(eq(demandeConge.id, demandeId));

  if (demande.type === "CONGE_PAYE") {
    await tx
      .update(dossierRH)
      .set({ soldeConges: sql`${dossierRH.soldeConges} - ${demande.nombreJours}` })
      .where(eq(dossierRH.id, demande.dossierRHId));
  }
}

export async function refuserDemandeConge(tx: TransactionDrizzle, demandeId: string, approuveParId: string): Promise<void> {
  const [demande] = await tx.select({ statut: demandeConge.statut }).from(demandeConge).where(eq(demandeConge.id, demandeId));
  if (!demande || demande.statut !== "EN_ATTENTE") return;

  await tx.update(demandeConge).set({ statut: "REFUSEE", approuveParId }).where(eq(demandeConge.id, demandeId));
}
