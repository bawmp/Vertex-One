"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { db } from "@/db/client";
import { entreprise, utilisateur, compte } from "@/db/schema";
import { auth } from "@/lib/auth";
import { creerUtilisateurChat } from "@/lib/chat/client";

const schemaInscription = z.object({
  nomEntreprise: z.string().trim().min(2, "Le nom de l'entreprise est trop court."),
  secteurProfil: z.enum(["agence", "artisan", "cabinet", "generique"]),
  nomComplet: z.string().trim().min(2, "Le nom complet est trop court."),
  email: z.email("Adresse email invalide."),
  motDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

export type EtatInscription = { erreur?: string } | null;

/**
 * Crée l'Entreprise et son premier Utilisateur (rôle ADMIN) dans le même
 * mouvement — voir docs/palier-0-*, section 8. Ne passe jamais par
 * l'endpoint public de Better-Auth (désactivé, voir src/lib/auth.ts) :
 * entrepriseId et role sont calculés ici, jamais reçus du client.
 */
export async function creerEntreprise(_etat: EtatInscription, formData: FormData): Promise<EtatInscription> {
  const analyse = schemaInscription.safeParse({
    nomEntreprise: formData.get("nomEntreprise"),
    secteurProfil: formData.get("secteurProfil"),
    nomComplet: formData.get("nomComplet"),
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { nomEntreprise, secteurProfil, nomComplet, email, motDePasse } = analyse.data;

  const motDePasseHash = await hashPassword(motDePasse);

  let idEntreprise: string;
  let idAdmin: string;

  try {
    const resultat = await db.transaction(async (tx) => {
      const [nouvelleEntreprise] = await tx
        .insert(entreprise)
        .values({ nom: nomEntreprise, secteurProfil })
        .returning({ id: entreprise.id });

      const [nouvelUtilisateur] = await tx
        .insert(utilisateur)
        .values({
          entrepriseId: nouvelleEntreprise.id,
          email,
          nomComplet,
          role: "ADMIN",
          statut: "ACTIF",
        })
        .returning({ id: utilisateur.id });

      await tx.insert(compte).values({
        userId: nouvelUtilisateur.id,
        providerId: "credential",
        issuer: createLocalAccountIssuer("credential"),
        accountId: nouvelUtilisateur.id,
        password: motDePasseHash,
      });

      // TODO Palier 0 (8bis) : provisionner la boîte mail sur sous-domaine
      // Vertex One via l'API Migadu — différé tant que MIGADU_API_KEY n'est
      // pas configuré, pour ne pas bloquer l'inscription en développement.

      return { entrepriseId: nouvelleEntreprise.id, utilisateurId: nouvelUtilisateur.id };
    });
    idEntreprise = resultat.entrepriseId;
    idAdmin = resultat.utilisateurId;
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message.includes("utilisateur_entreprise_email_unique")) {
      return { erreur: "Cette adresse email est déjà utilisée." };
    }
    throw erreur;
  }

  // Palier 3, section 6 — même provisionnement chat qu'à l'activation d'une
  // invitation : le premier Administrateur doit lui aussi être disponible
  // dans les canaux dès la création de son entreprise.
  await creerUtilisateurChat(idEntreprise, idAdmin, nomComplet);

  // Établit la session via Better-Auth (vérifie le mot de passe qu'on vient
  // de hacher, pose le cookie de session) plutôt que de la construire nous-
  // mêmes — un seul endroit sait comment une session valide est fabriquée.
  await auth.api.signInEmail({
    body: { email, password: motDePasse },
    headers: await headers(),
  });

  redirect("/app");
}
