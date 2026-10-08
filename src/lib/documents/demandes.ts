import { and, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { demandeSuppressionDocument, utilisateur } from "@/db/schema";

import type { DemandeSuppressionEnAttente } from "@/app/app/projets/liste-documents";
export type { DemandeSuppressionEnAttente };

/**
 * Demandes de suppression en attente pour des documents donnés, par identifiant de document. Le nom du demandeur et
 * le motif ne sont renvoyés qu'à l'Administrateur (`details: true`) : les autres savent seulement qu'une demande
 * existe (pour ne pas en déposer une seconde), sans voir qui l'a faite. Lecture dans la transaction de l'appelant,
 * donc toujours sous la RLS de l'entreprise ; l'identifiant d'entreprise est en plus filtré explicitement sur
 * `utilisateur` (RLS permissive, voir CLAUDE.md).
 */
export async function demandesSuppressionEnAttente(
  tx: TransactionDrizzle,
  entrepriseId: string,
  documentIds: string[],
  details: boolean
): Promise<Record<string, DemandeSuppressionEnAttente>> {
  if (documentIds.length === 0) return {};
  const lignes = await tx
    .select()
    .from(demandeSuppressionDocument)
    .where(and(eq(demandeSuppressionDocument.entrepriseId, entrepriseId), eq(demandeSuppressionDocument.statut, "EN_ATTENTE"), inArray(demandeSuppressionDocument.documentId, documentIds)));
  if (lignes.length === 0) return {};

  const noms: Record<string, string> = {};
  if (details) {
    const auteurs = await tx
      .select({ id: utilisateur.id, nom: utilisateur.nomComplet })
      .from(utilisateur)
      .where(and(eq(utilisateur.entrepriseId, entrepriseId), inArray(utilisateur.id, [...new Set(lignes.map((l) => l.demandeParId))])));
    for (const a of auteurs) noms[a.id] = a.nom;
  }

  return Object.fromEntries(
    lignes.map((l) => [
      l.documentId,
      { id: l.id, demandeParNom: details ? (noms[l.demandeParId] ?? "—") : "", motif: details ? l.motif : null, creeLe: l.creeLe.toISOString() },
    ])
  );
}
