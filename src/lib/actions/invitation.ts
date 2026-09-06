"use server";

import { z } from "zod";
import { eq, and, isNull, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { db, avecEntreprise } from "@/db/client";
import { invitation, utilisateur, compte, dossierRH } from "@/db/schema";
import { auth } from "@/lib/auth";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { creerUtilisateurChat } from "@/lib/chat/client";

const DUREE_EXPIRATION_MS = 72 * 60 * 60 * 1000; // 72 heures — voir docs/palier-0-*, section 8

const schemaInvitation = z.object({
  email: z.email(),
  roleProposee: z.enum(["MANAGER", "EMPLOYE", "CLIENT"]),
  postePropose: z.string().trim().optional(),
  typeContratPropose: z.enum(["CDI", "CDD", "STAGE", "PRESTATAIRE"]).optional(),
  dateEmbauchePropose: z.string().optional(),
});

export type EtatInvitation = { erreur?: string; succes?: string } | null;

/**
 * Réservé à qui a le droit de créer sur PARAMETRES (ADMIN dans la matrice
 * actuelle — voir src/lib/permissions.ts). La date d'embauche est saisie ici
 * à la main par la personne qui invite, jamais déduite : c'est elle qui sait
 * quand la personne a réellement été embauchée.
 */
export async function creerInvitation(_etat: EtatInvitation, formData: FormData): Promise<EtatInvitation> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PARAMETRES", "CREER")) {
    return { erreur: "Vous n'avez pas le droit d'inviter de nouveaux collaborateurs." };
  }

  const analyse = schemaInvitation.safeParse({
    email: formData.get("email"),
    roleProposee: formData.get("roleProposee"),
    postePropose: formData.get("postePropose") || undefined,
    typeContratPropose: formData.get("typeContratPropose") || undefined,
    dateEmbauchePropose: formData.get("dateEmbauchePropose") || undefined,
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { email, roleProposee, postePropose, typeContratPropose, dateEmbauchePropose } = analyse.data;

  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(invitation).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      email,
      roleProposee,
      postePropose,
      typeContratPropose,
      dateEmbauchePropose: dateEmbauchePropose ? new Date(dateEmbauchePropose) : undefined,
      jeton,
      expireLe: new Date(Date.now() + DUREE_EXPIRATION_MS),
    })
  );

  // TODO Palier 0 (8bis) / envoi réel : notifier par email (Resend/Postmark)
  // et WhatsApp plutôt que d'afficher le lien à copier-coller (voir la page
  // équipe, qui affiche ce lien en attendant l'intégration d'envoi réel).
  return { succes: `Invitation créée : /invitation/${jeton}` };
}

const schemaAcceptation = z.object({
  jeton: z.string(),
  nomComplet: z.string().trim().min(2, "Le nom complet est trop court."),
  motDePasse: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

export type EtatAcceptation = { erreur?: string } | null;

/**
 * Active le compte d'un invité. Ne fait jamais confiance à un entrepriseId
 * ou un rôle envoyé par le client — les deux viennent exclusivement de la
 * ligne "invitation" retrouvée par jeton, jamais du formulaire. Crée aussi
 * le DossierRH dans le même mouvement pour tout rôle interne (section 8).
 */
export async function accepterInvitation(_etat: EtatAcceptation, formData: FormData): Promise<EtatAcceptation> {
  const analyse = schemaAcceptation.safeParse({
    jeton: formData.get("jeton"),
    nomComplet: formData.get("nomComplet"),
    motDePasse: formData.get("motDePasse"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { jeton, nomComplet, motDePasse } = analyse.data;

  const [invitationValide] = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.jeton, jeton), isNull(invitation.utiliseeLe), gt(invitation.expireLe, new Date())));

  if (!invitationValide) {
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }

  const motDePasseHash = await hashPassword(motDePasse);

  const idNouvelUtilisateur = await avecEntreprise(invitationValide.entrepriseId, async (tx) => {
    const [nouvelUtilisateur] = await tx
      .insert(utilisateur)
      .values({
        entrepriseId: invitationValide.entrepriseId,
        email: invitationValide.email,
        nomComplet,
        role: invitationValide.roleProposee,
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

    if (invitationValide.roleProposee !== "CLIENT") {
      await tx.insert(dossierRH).values({
        entrepriseId: invitationValide.entrepriseId,
        utilisateurId: nouvelUtilisateur.id,
        poste: invitationValide.postePropose ?? "Non renseigné",
        typeContrat: invitationValide.typeContratPropose ?? "CDI",
        // Date d'embauche réelle saisie par la personne qui a créé
        // l'invitation — jamais la date d'activation du compte.
        dateEmbauche: invitationValide.dateEmbauchePropose ?? new Date(),
      });
    }

    await tx.update(invitation).set({ utiliseeLe: new Date() }).where(eq(invitation.id, invitationValide.id));

    return nouvelUtilisateur.id;
  });

  // Palier 3, section 6 — provisionnement chez le prestataire de chat dès
  // qu'un compte devient ACTIF, pour être immédiatement disponible dans les
  // canaux de son entreprise. Hors transaction : appel externe, jamais une
  // écriture SQL à faire échouer/annuler avec le reste.
  await creerUtilisateurChat(invitationValide.entrepriseId, idNouvelUtilisateur, nomComplet);

  await auth.api.signInEmail({
    body: { email: invitationValide.email, password: motDePasse },
    headers: await headers(),
  });

  redirect("/app");
}
