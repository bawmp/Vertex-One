import { and, asc, count, eq, gte, ne, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { projet, tache, tacheCrm } from "@/db/schema";

export type TacheDeFiche = { id: string; titre: string; statut: string; echeance: Date | null; origine: string; lien: string | null };
export type TachesDeFiche = { ouvertes: TacheDeFiche[]; termineesRecemment: number; enRetard: number };

/** Une tâche est en retard si son échéance est passée et qu'elle n'est pas terminée. */
export const estEnRetard = (echeance: Date | null, maintenant: Date) => echeance !== null && echeance.getTime() < maintenant.getTime();

/**
 * Tâches d'un collaborateur pour sa fiche : celles des projets (`tache`) et les activités CRM (`tache_crm`) qui lui sont assignées et ne
 * sont pas terminées, les plus proches de l'échéance d'abord, plus le nombre de tâches terminées ces 30 derniers jours. Seuls le titre, le
 * statut, l'échéance et le projet sont lus : jamais le contenu d'un dossier. Qui a le droit de VOIR la fiche est décidé par l'appelant
 * (page de la fiche) ; ici tout est relu dans l'entreprise donnée.
 */
export async function tachesDuCollaborateur(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, maintenant: Date = new Date()): Promise<TachesDeFiche> {
  const il30j = new Date(maintenant.getTime() - 30 * 86_400_000);
  const [projets, crm, [tp], [tc]] = await Promise.all([
    tx
      .select({ id: tache.id, titre: tache.titre, statut: tache.statut, echeance: tache.echeance, projetId: projet.id, projetTitre: projet.titre })
      .from(tache)
      .innerJoin(projet, eq(tache.projetId, projet.id))
      .where(and(eq(tache.entrepriseId, entrepriseId), eq(tache.assigneAId, utilisateurId), ne(tache.statut, "TERMINEE")))
      .orderBy(sql`${tache.echeance} asc nulls last`, asc(tache.ordre))
      .limit(60),
    tx
      .select({ id: tacheCrm.id, objet: tacheCrm.objet, statut: tacheCrm.statut, echeance: tacheCrm.dateEcheance })
      .from(tacheCrm)
      .where(and(eq(tacheCrm.entrepriseId, entrepriseId), eq(tacheCrm.assigneAId, utilisateurId), ne(tacheCrm.statut, "TERMINEE")))
      .orderBy(sql`${tacheCrm.dateEcheance} asc nulls last`)
      .limit(60),
    tx.select({ n: count() }).from(tache).where(and(eq(tache.entrepriseId, entrepriseId), eq(tache.assigneAId, utilisateurId), gte(tache.termineeLe, il30j))),
    tx.select({ n: count() }).from(tacheCrm).where(and(eq(tacheCrm.entrepriseId, entrepriseId), eq(tacheCrm.assigneAId, utilisateurId), gte(tacheCrm.termineeLe, il30j))),
  ]);
  const ouvertes: TacheDeFiche[] = [
    ...projets.map((t): TacheDeFiche => ({ id: t.id, titre: t.titre, statut: t.statut, echeance: t.echeance, origine: `Projet ${t.projetTitre}`, lien: `/app/projets/${t.projetId}` })),
    ...crm.map((t): TacheDeFiche => ({ id: t.id, titre: t.objet, statut: t.statut, echeance: t.echeance, origine: "Activité CRM", lien: null })),
  ].sort((a, b) => (a.echeance?.getTime() ?? Infinity) - (b.echeance?.getTime() ?? Infinity));
  return { ouvertes, termineesRecemment: (tp?.n ?? 0) + (tc?.n ?? 0), enRetard: ouvertes.filter((t) => estEnRetard(t.echeance, maintenant)).length };
}
