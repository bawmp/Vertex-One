"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { creerGroupePour, genererInvitationGroupePour, rattacherFilialeAuGroupePour, quitterGroupePour, type ResultatGroupe } from "@/lib/groupe/logique";

const CHEMIN = "/app/parametres/entreprise";

export type EtatGroupe = ResultatGroupe;

/**
 * Groupe d'entreprises (2026-09-15) — lien purement organisationnel entre
 * plusieurs `entreprise` par ailleurs totalement indépendantes (données,
 * abonnement, connexion). La logique elle-même vit dans
 * src/lib/groupe/logique.ts (testable sans session HTTP réelle) ; ces
 * actions ne font que résoudre/vérifier la session puis déléguer. Réservé à
 * l'Administrateur, même garde que le reste de Paramètres.
 */
export async function creerGroupe(_etat: EtatGroupe, formData: FormData): Promise<EtatGroupe> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Seul l'Administrateur peut créer un groupe." };
  }

  const analyse = z.object({ nom: z.string().trim().min(2, "Le nom du groupe est trop court.") }).safeParse({ nom: formData.get("nom") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const resultat = await creerGroupePour(utilisateurConnecte.entrepriseId, analyse.data.nom);
  revalidatePath(CHEMIN);
  return resultat;
}

/**
 * Génère un code à usage unique pour rattacher une autre entreprise (déjà
 * existante, avec sa propre connexion) au groupe de l'entreprise courante.
 * Le code se colle depuis Paramètres → Entreprise de l'AUTRE côté — jamais
 * de lien cliquable magique, chaque filiale garde sa propre session.
 */
export async function genererInvitationGroupe(): Promise<EtatGroupe> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Seul l'Administrateur peut générer un code de rattachement." };
  }

  const resultat = await genererInvitationGroupePour(utilisateurConnecte.entrepriseId);
  revalidatePath(CHEMIN);
  return resultat;
}

export async function rattacherFilialeAuGroupe(_etat: EtatGroupe, formData: FormData): Promise<EtatGroupe> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Seul l'Administrateur peut rattacher cette entreprise à un groupe." };
  }

  const analyse = z.object({ jeton: z.string().trim().min(1, "Le code est requis.") }).safeParse({ jeton: formData.get("jeton") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const resultat = await rattacherFilialeAuGroupePour(utilisateurConnecte.entrepriseId, analyse.data.jeton);
  revalidatePath(CHEMIN);
  return resultat;
}

export async function quitterGroupe(): Promise<void> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "MODIFIER")) return;

  await quitterGroupePour(utilisateurConnecte.entrepriseId);
  revalidatePath(CHEMIN);
}
