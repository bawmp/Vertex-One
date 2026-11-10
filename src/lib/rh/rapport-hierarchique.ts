import { alias } from "drizzle-orm/pg-core";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, rapportHierarchique, utilisateur } from "@/db/schema";
import { destinatairesAutorises, peutLireRapport, type PersonneRapport } from "@/lib/rh/rapport-hierarchique-regles";

/**
 * Personnes à qui l'utilisateur connecté peut écrire un rapport. `utilisateur` est en RLS permissive (Better-Auth) : le filtre sur
 * l'entreprise est donc explicite, jamais déduit. Lu en base à chaque envoi — le destinataire envoyé par le navigateur n'est jamais cru.
 */
export async function destinatairesPossibles(tx: TransactionDrizzle, moi: { utilisateurId: string; entrepriseId: string; role: string }): Promise<PersonneRapport[]> {
  const personnes = await tx
    .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet, role: utilisateur.role, statut: utilisateur.statut, managerId: utilisateur.managerId })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, moi.entrepriseId), ne(utilisateur.statut, "SUPPRIME")));
  return destinatairesAutorises({ id: moi.utilisateurId, role: moi.role }, personnes);
}

/**
 * Lit un rapport pour son auteur ou son destinataire, avec les informations de l'en-tête de l'entreprise. Renvoie null quand le rapport
 * n'existe pas OU que la personne n'en est ni l'auteur ni le destinataire (même réponse : on ne révèle rien, l'Administrateur compris).
 * `marquerLu` : le destinataire qui ouvre la page le marque comme lu (horloge de la base) ; jamais pour un simple PDF.
 */
export async function lireRapportPourPersonne(tx: TransactionDrizzle, moi: { utilisateurId: string; entrepriseId: string }, id: string, options: { marquerLu: boolean }) {
  const auteur = alias(utilisateur, "auteur");
  const destinataire = alias(utilisateur, "destinataire");
  const [r] = await tx
    .select({
      objet: rapportHierarchique.objet,
      contenu: rapportHierarchique.contenu,
      modele: rapportHierarchique.modele,
      sections: rapportHierarchique.sections,
      creeLe: rapportHierarchique.creeLe,
      luLe: rapportHierarchique.luLe,
      auteurId: rapportHierarchique.auteurId,
      destinataireId: rapportHierarchique.destinataireId,
      auteurNom: auteur.nomComplet,
      destinataireNom: destinataire.nomComplet,
    })
    .from(rapportHierarchique)
    .innerJoin(auteur, eq(rapportHierarchique.auteurId, auteur.id))
    .innerJoin(destinataire, eq(rapportHierarchique.destinataireId, destinataire.id))
    .where(and(eq(rapportHierarchique.id, id), eq(rapportHierarchique.entrepriseId, moi.entrepriseId)));
  if (!r || !peutLireRapport(moi.utilisateurId, r)) return null;

  if (options.marquerLu && r.destinataireId === moi.utilisateurId && !r.luLe) {
    await tx
      .update(rapportHierarchique)
      .set({ luLe: sql`now()` })
      .where(and(eq(rapportHierarchique.id, id), isNull(rapportHierarchique.luLe)));
  }

  const [e] = await tx
    .select({
      id: entreprise.id,
      nom: entreprise.nom,
      adresse: entreprise.adresse,
      ville: entreprise.ville,
      niu: entreprise.niu,
      rccm: entreprise.rccm,
      couleurMarque: entreprise.couleurMarque,
      logoCleStockage: entreprise.logoCleStockage,
      logoTypeMime: entreprise.logoTypeMime,
      filigraneDocuments: entreprise.filigraneDocuments,
      planAbonnement: entreprise.planAbonnement,
      statutAbonnement: entreprise.statutAbonnement,
    })
    .from(entreprise)
    .where(eq(entreprise.id, moi.entrepriseId));
  return { ...r, entreprise: e };
}
