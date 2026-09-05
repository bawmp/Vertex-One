import { eq, and, lt, notInArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { facture } from "@/db/schema";

/**
 * Docs/palier-1-*, section 6, étape 6 — à appeler quotidiennement par la
 * file d'attente Postgres (graphile-worker, pas encore installée dans ce
 * projet : le déclenchement planifié est différé, cette fonction est prête
 * à être branchée dessus). Fait passer en EN_RETARD les factures dont
 * l'échéance est dépassée sans paiement complet, et renvoie leurs ids pour
 * l'envoi de la relance WhatsApp (non implémenté — API Meta Cloud non
 * configurée, même traitement que Migadu/NotchPay).
 */
export async function marquerFacturesEnRetard(tx: TransactionDrizzle, entrepriseId: string): Promise<string[]> {
  const enRetard = await tx
    .update(facture)
    .set({ statut: "EN_RETARD" })
    .where(
      and(
        eq(facture.entrepriseId, entrepriseId),
        lt(facture.dateEcheance, new Date()),
        notInArray(facture.statut, ["PAYEE", "ANNULEE", "EN_RETARD"])
      )
    )
    .returning({ id: facture.id });

  return enRetard.map((f) => f.id);
}
