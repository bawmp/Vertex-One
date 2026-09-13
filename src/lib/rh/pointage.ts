import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { pointage, dossierRH, shift } from "@/db/schema";

export function debutJournee(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calcule PRESENT/RETARD à partir du shift assigné (échange du 2026-09-12) —
 * fonction pure, testable sans base de données. Donne enfin un usage réel
 * au statut RETARD de `pointage`, prévu dès le Palier 5 mais jamais calculé
 * jusqu'ici (toujours PRESENT, aucun shift n'existait). Sans shift assigné,
 * comportement inchangé : toujours PRESENT.
 */
export function calculerStatutArrivee(shiftInfo: { heureDebut: string; toleranceMinutes: number } | null, heureArrivee: Date): "PRESENT" | "RETARD" {
  if (!shiftInfo) return "PRESENT";

  const [h, m] = shiftInfo.heureDebut.split(":").map(Number);
  const limite = new Date(heureArrivee);
  limite.setHours(h, m + shiftInfo.toleranceMinutes, 0, 0);

  return heureArrivee > limite ? "RETARD" : "PRESENT";
}

/**
 * Bouton "Je suis arrivé" (docs/palier-5-*, section 3) — une ligne par jour
 * (uniqueIndex dossierRHId+date), créée ou complétée selon ce qui existe déjà
 * pour aujourd'hui plutôt qu'un formulaire de saisie d'heures.
 */
export async function pointerArrivee(tx: TransactionDrizzle, entrepriseId: string, dossierRHId: string): Promise<void> {
  const aujourdHui = debutJournee(new Date());
  const maintenant = new Date();

  const [existant] = await tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, aujourdHui)));
  if (existant?.heureArrivee) return; // déjà pointé aujourd'hui, pas de double arrivée

  const [dossier] = await tx.select({ shiftId: dossierRH.shiftId }).from(dossierRH).where(eq(dossierRH.id, dossierRHId));
  const leShift = dossier?.shiftId ? (await tx.select({ heureDebut: shift.heureDebut, toleranceMinutes: shift.toleranceMinutes }).from(shift).where(eq(shift.id, dossier.shiftId)))[0] ?? null : null;
  const statut = calculerStatutArrivee(leShift, maintenant);

  if (existant) {
    await tx.update(pointage).set({ heureArrivee: maintenant, statut }).where(eq(pointage.id, existant.id));
    return;
  }

  await tx.insert(pointage).values({ entrepriseId, dossierRHId, date: aujourdHui, heureArrivee: maintenant, statut });
}

export async function pointerDepart(tx: TransactionDrizzle, dossierRHId: string): Promise<void> {
  const aujourdHui = debutJournee(new Date());

  const [existant] = await tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, aujourdHui)));
  if (!existant || existant.heureDepart) return; // pas encore arrivé aujourd'hui, ou déjà parti

  await tx.update(pointage).set({ heureDepart: new Date() }).where(eq(pointage.id, existant.id));
}
