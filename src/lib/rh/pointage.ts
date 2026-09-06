import { eq, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { pointage } from "@/db/schema";

export function debutJournee(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

  if (existant) {
    if (existant.heureArrivee) return; // déjà pointé aujourd'hui, pas de double arrivée
    await tx.update(pointage).set({ heureArrivee: maintenant, statut: "PRESENT" }).where(eq(pointage.id, existant.id));
    return;
  }

  await tx.insert(pointage).values({ entrepriseId, dossierRHId, date: aujourdHui, heureArrivee: maintenant, statut: "PRESENT" });
}

export async function pointerDepart(tx: TransactionDrizzle, dossierRHId: string): Promise<void> {
  const aujourdHui = debutJournee(new Date());

  const [existant] = await tx.select().from(pointage).where(and(eq(pointage.dossierRHId, dossierRHId), eq(pointage.date, aujourdHui)));
  if (!existant || existant.heureDepart) return; // pas encore arrivé aujourd'hui, ou déjà parti

  await tx.update(pointage).set({ heureDepart: new Date() }).where(eq(pointage.id, existant.id));
}
