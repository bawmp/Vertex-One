import { eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur as tableUtilisateur, dossier, projet, tache } from "@/db/schema";
import { portee, type Module } from "@/lib/permissions";
import type { UtilisateurConnecte } from "@/lib/session";

/**
 * Traduit portee(role, module) en filtre concret sur assigneAId — voir
 * docs/palier-0-*, section 5. "TOUT" signifie "ne pas filtrer" ; sinon la
 * liste d'ids à utiliser dans un .where(inArray(colonne.assigneAId, ids)).
 */
export async function idsVisibles(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte,
  module: Module
): Promise<"TOUT" | string[]> {
  const scope = portee(utilisateurConnecte.role, module);

  if (scope === "TOUT") return "TOUT";
  if (scope === "PROPRE") return [utilisateurConnecte.utilisateurId];

  // EQUIPE : l'utilisateur lui-même + les collaborateurs qui lui sont rattachés.
  const membres = await tx
    .select({ id: tableUtilisateur.id })
    .from(tableUtilisateur)
    .where(eq(tableUtilisateur.managerId, utilisateurConnecte.utilisateurId));

  return [utilisateurConnecte.utilisateurId, ...membres.map((m) => m.id)];
}

/**
 * Portée sur un Projet (Palier 2, section 5) : plus riche qu'un simple
 * assigneAId — un Projet est visible s'il est visible via idsVisibles()
 * (soi-même + équipe selon la portée du rôle) sur responsablePrincipalId,
 * OU si l'un de ces mêmes utilisateurs a au moins une Tache assignée dans
 * ce Projet (un Employé peut voir un Projet précis sans en être le
 * responsable principal).
 */
export async function projetsVisibles(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte
): Promise<"TOUT" | string[]> {
  const idsResponsables = await idsVisibles(tx, utilisateurConnecte, "PROJETS");
  if (idsResponsables === "TOUT") return "TOUT";

  const [parResponsable, parTache] = await Promise.all([
    tx.select({ id: projet.id }).from(projet).where(inArray(projet.responsablePrincipalId, idsResponsables)),
    tx.selectDistinct({ id: tache.projetId }).from(tache).where(inArray(tache.assigneAId, idsResponsables)),
  ]);

  return [...new Set([...parResponsable.map((p) => p.id), ...parTache.map((t) => t.id)])];
}

/**
 * Portée sur un Dossier (Palier 2, section 5) : visible si l'utilisateur
 * (ou son équipe) en est responsable, OU s'il a accès à au moins un Projet
 * qu'il contient — sinon un Employé perdrait de vue un Dossier client dès
 * qu'il n'en est pas le responsable, même s'il travaille activement sur un
 * Projet à l'intérieur.
 */
export async function dossiersVisibles(
  tx: TransactionDrizzle,
  utilisateurConnecte: UtilisateurConnecte
): Promise<"TOUT" | string[]> {
  const idsResponsables = await idsVisibles(tx, utilisateurConnecte, "DOSSIERS");
  if (idsResponsables === "TOUT") return "TOUT";

  const idsProjets = await projetsVisibles(tx, utilisateurConnecte);

  const [parResponsable, parProjet] = await Promise.all([
    tx.select({ id: dossier.id }).from(dossier).where(inArray(dossier.responsableId, idsResponsables)),
    idsProjets === "TOUT" || idsProjets.length === 0
      ? Promise.resolve([])
      : tx.selectDistinct({ id: projet.dossierId }).from(projet).where(inArray(projet.id, idsProjets)),
  ]);

  return [...new Set([...parResponsable.map((d) => d.id), ...parProjet.map((p) => p.id)])];
}
