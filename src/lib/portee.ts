import { eq, inArray, notInArray, and } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur as tableUtilisateur, dossier, projet, tache, autorisationDepartementRh } from "@/db/schema";
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
  const scope = portee(utilisateurConnecte, module);

  if (scope === "TOUT") return "TOUT";
  if (scope === "PROPRE") return [utilisateurConnecte.utilisateurId];

  // EQUIPE : l'utilisateur lui-même + toute son équipe étendue (ses
  // subordonnés directs, les subordonnés de ses subordonnés, etc.) —
  // parcours en largeur plutôt qu'un WITH RECURSIVE (aucun précédent dans ce
  // projet, tout passe par le query builder Drizzle ; voir le commentaire
  // sur PROFONDEUR_MAX_EQUIPE). Corrigé le 2026-09-15 : la version
  // précédente ne remontait qu'un seul niveau — un directeur ne voyait donc
  // que ses subordonnés directs, jamais ceux de ses managers intermédiaires.
  const visites = new Set([utilisateurConnecte.utilisateurId]);
  let frontiere = [utilisateurConnecte.utilisateurId];

  for (let profondeur = 0; profondeur < PROFONDEUR_MAX_EQUIPE && frontiere.length > 0; profondeur++) {
    const membres = await tx
      .select({ id: tableUtilisateur.id })
      .from(tableUtilisateur)
      .where(and(inArray(tableUtilisateur.managerId, frontiere), notInArray(tableUtilisateur.id, [...visites])));

    if (membres.length === 0) break;
    frontiere = membres.map((m) => m.id);
    for (const id of frontiere) visites.add(id);
  }

  // Frontière de département, RH uniquement (2026-09-15) — toujours une
  // ADDITION à la hiérarchie déjà calculée ci-dessus, jamais une
  // soustraction : la hiérarchie reste visible quel que soit le département
  // de chacun. Un Manager voit en plus son propre département, puis tout
  // département explicitement autorisé par l'Administrateur
  // (autorisationDepartementRh) — jamais les autres.
  if (module === "RH") {
    const [visiteur] = await tx.select({ serviceId: tableUtilisateur.serviceId }).from(tableUtilisateur).where(eq(tableUtilisateur.id, utilisateurConnecte.utilisateurId));

    const autorisations = await tx
      .select({ serviceId: autorisationDepartementRh.serviceId })
      .from(autorisationDepartementRh)
      .where(eq(autorisationDepartementRh.utilisateurId, utilisateurConnecte.utilisateurId));

    const departementsVisibles = new Set<string>();
    if (visiteur?.serviceId) departementsVisibles.add(visiteur.serviceId);
    for (const a of autorisations) departementsVisibles.add(a.serviceId);

    if (departementsVisibles.size > 0) {
      const membresDepartements = await tx
        .select({ id: tableUtilisateur.id })
        .from(tableUtilisateur)
        .where(inArray(tableUtilisateur.serviceId, [...departementsVisibles]));
      for (const m of membresDepartements) visites.add(m.id);
    }
  }

  return [...visites];
}

// Garde-fou anti-boucle infinie si une chaîne de management est corrompue
// (ex. A gère B qui gère A) — une hiérarchie réelle ne dépasse jamais 15
// niveaux, ce plafond n'a donc aucun effet dans un cas normal.
const PROFONDEUR_MAX_EQUIPE = 15;

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
