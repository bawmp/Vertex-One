import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { regularisationPointage, pointage, dossierRH, shift } from "@/db/schema";
import { calculerStatutArrivee } from "@/lib/rh/pointage";

/**
 * Régularisation de pointage (échange du 2026-09-12, comparaison avec Zoho
 * People — "Regularization") : la correction n'est appliquée à `pointage`
 * qu'à l'approbation, jamais à la demande — même principe que
 * approuverDemandeConge() (src/lib/rh/conges.ts). Seuls les champs
 * effectivement proposés sont écrasés ; un champ non proposé garde sa
 * valeur existante (une régularisation ne concerne parfois que l'arrivée
 * OU le départ, jamais forcément les deux).
 */
export async function approuverRegularisation(tx: TransactionDrizzle, regularisationId: string, approuveParId: string): Promise<void> {
  const [demande] = await tx.select().from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId));
  if (!demande || demande.statut !== "EN_ATTENTE") return;

  await tx.update(regularisationPointage).set({ statut: "APPROUVEE", approuveParId }).where(eq(regularisationPointage.id, regularisationId));

  const [existant] = await tx.select().from(pointage).where(and(eq(pointage.dossierRHId, demande.dossierRHId), eq(pointage.date, demande.date)));
  const heureArriveeFinale = demande.heureArriveeProposee ?? existant?.heureArrivee ?? null;

  // Même calcul que pointerArrivee() (échange du 2026-09-12) — une
  // régularisation qui corrige l'arrivée doit refléter un vrai retard si le
  // shift assigné en indique un, jamais un PRESENT systématique qui
  // masquerait la correction elle-même.
  const [dossier] = await tx.select({ shiftId: dossierRH.shiftId }).from(dossierRH).where(eq(dossierRH.id, demande.dossierRHId));
  const leShift = dossier?.shiftId ? (await tx.select({ heureDebut: shift.heureDebut, toleranceMinutes: shift.toleranceMinutes }).from(shift).where(eq(shift.id, dossier.shiftId)))[0] ?? null : null;
  const statut = heureArriveeFinale ? calculerStatutArrivee(leShift, heureArriveeFinale) : "PRESENT";

  if (existant) {
    await tx
      .update(pointage)
      .set({
        heureArrivee: demande.heureArriveeProposee ?? existant.heureArrivee,
        heureDepart: demande.heureDepartProposee ?? existant.heureDepart,
        statut,
      })
      .where(eq(pointage.id, existant.id));
  } else {
    await tx.insert(pointage).values({
      entrepriseId: demande.entrepriseId,
      dossierRHId: demande.dossierRHId,
      date: demande.date,
      heureArrivee: demande.heureArriveeProposee,
      heureDepart: demande.heureDepartProposee,
      statut,
    });
  }
}

export async function refuserRegularisation(tx: TransactionDrizzle, regularisationId: string, approuveParId: string): Promise<void> {
  const [demande] = await tx.select({ statut: regularisationPointage.statut }).from(regularisationPointage).where(eq(regularisationPointage.id, regularisationId));
  if (!demande || demande.statut !== "EN_ATTENTE") return;

  await tx.update(regularisationPointage).set({ statut: "REFUSEE", approuveParId }).where(eq(regularisationPointage.id, regularisationId));
}
