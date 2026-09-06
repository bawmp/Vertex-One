import "server-only";
import { db } from "@/db/client";
import { compteComptable } from "@/db/schema";
import { PLAN_COMPTABLE_SYSCOHADA } from "./plan-comptable-syscohada";

/**
 * Idempotent — à exécuter une fois au déploiement (référentiel global, pas
 * par entreprise, voir src/db/schema.ts). Un numéro de compte déjà présent
 * n'est jamais écrasé : le libellé d'un compte comptable ne doit pas changer
 * silencieusement sous des écritures déjà passées dessus.
 */
export async function importerPlanComptable(): Promise<{ inseres: number; total: number }> {
  const resultat = await db
    .insert(compteComptable)
    .values(PLAN_COMPTABLE_SYSCOHADA)
    .onConflictDoNothing({ target: compteComptable.numero })
    .returning({ id: compteComptable.id });

  return { inseres: resultat.length, total: PLAN_COMPTABLE_SYSCOHADA.length };
}
