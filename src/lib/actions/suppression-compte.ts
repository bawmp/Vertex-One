"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, db } from "@/db/client";
import { utilisateur, session, compte, invitation } from "@/db/schema";
import { annulerInvitationsNonUtilisees } from "@/lib/invitations/annulation";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";

/**
 * Retire un Manager, un Employé ou un client du portail (2026-10-22). Réservé à l'Administrateur.
 * La ligne `utilisateur` reste (statut SUPPRIME) : ses documents, tâches et messages gardent leur auteur, et une facture
 * ne s'efface de toute façon jamais. Le compte, lui, ne peut plus rien : sessions et identifiants de connexion effacés,
 * adresse email libérée (pour pouvoir réinviter la personne), plus de lien hiérarchique.
 * Le rôle, le statut et l'entreprise de la cible sont relus en base, jamais pris dans la requête.
 */
export async function supprimerCompte(utilisateurId: string): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut supprimer un compte.") };
  if (utilisateurId === utilisateurConnecte.utilisateurId) return { erreur: t("Vous ne pouvez pas supprimer votre propre compte.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // `utilisateur` est en RLS permissive : le filtre sur l'entreprise est explicite.
    const [cible] = await tx
      .select({ role: utilisateur.role, statut: utilisateur.statut, email: utilisateur.email })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!cible || cible.statut === "SUPPRIME") return { erreur: t("Compte introuvable.") };
    if (!["MANAGER", "EMPLOYE", "CLIENT"].includes(cible.role)) return { erreur: t("Un compte Administrateur ne peut pas être supprimé ici.") };

    // Ses invitations restées sans suite (en attente ou expirées) sont annulées : le lien ne doit plus rien permettre.
    const enAttente = await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(and(eq(invitation.entrepriseId, utilisateurConnecte.entrepriseId), eq(invitation.email, cible.email), isNull(invitation.utiliseeLe)));
    await annulerInvitationsNonUtilisees(tx, utilisateurConnecte.entrepriseId, enAttente.map((i) => i.id));

    // Ceux qu'elle encadrait n'ont plus de manager (la portée « équipe » ne doit pas passer par un compte supprimé).
    await tx.update(utilisateur).set({ managerId: null }).where(and(eq(utilisateur.managerId, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    await tx
      .update(utilisateur)
      .set({ statut: "SUPPRIME", email: `supprime-${utilisateurId}@compte-supprime.invalid`, managerId: null })
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { ok: true };
  });
  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };

  // Tables de Better-Auth (hors RLS stricte) : plus aucune session ni mot de passe. Seulement après la vérification ci-dessus.
  await db.delete(session).where(eq(session.userId, utilisateurId));
  await db.delete(compte).where(inArray(compte.userId, [utilisateurId]));

  revalidatePath("/app/parametres/equipe");
  return null;
}

/**
 * Désactive un compte actif ou réactive un compte désactivé (2026-10-22). Réservé à l'Administrateur.
 * Désactiver coupe l'accès sur-le-champ (sessions fermées, `recupererUtilisateurConnecte()` refuse tout statut non ACTIF) mais
 * garde le mot de passe : réactiver rend l'accès tel quel. Seuls Manager, Employé et client du portail, de CETTE entreprise ;
 * un compte invité (jamais activé) ou supprimé n'est pas concerné. Le statut actuel est relu en base.
 */
export async function definirActivationCompte(utilisateurId: string, actif: boolean): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut activer ou désactiver un compte.") };
  if (utilisateurId === utilisateurConnecte.utilisateurId) return { erreur: t("Vous ne pouvez pas désactiver votre propre compte.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [cible] = await tx
      .select({ role: utilisateur.role, statut: utilisateur.statut })
      .from(utilisateur)
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!cible || (cible.statut !== "ACTIF" && cible.statut !== "DESACTIVE")) return { erreur: t("Compte introuvable.") };
    if (!["MANAGER", "EMPLOYE", "CLIENT"].includes(cible.role)) return { erreur: t("Un compte Administrateur ne peut pas être désactivé ici.") };

    await tx
      .update(utilisateur)
      .set({ statut: actif ? "ACTIF" : "DESACTIVE" })
      .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId)));
    return { ok: true };
  });
  if ("erreur" in resultat && resultat.erreur) return { erreur: resultat.erreur };

  if (!actif) await db.delete(session).where(eq(session.userId, utilisateurId));

  revalidatePath("/app/parametres/equipe");
  return null;
}
