import { eq } from "drizzle-orm";
import { generateRandomString } from "better-auth/crypto";
import type { TransactionDrizzle } from "@/db/client";
import { candidature, posteOuvert, invitation } from "@/db/schema";

const DUREE_EXPIRATION_INVITATION_MS = 72 * 60 * 60 * 1000; // même durée que creerInvitation()

export type ResultatConversion = { erreur?: string; succes?: string };

/**
 * Réutilise le flux invitation existant tel quel — aucune nouvelle mécanique
 * de création de compte : accepterInvitation() (src/lib/actions/invitation.ts)
 * gère déjà l'activation du compte et la création du dossierRH, sans aucune
 * modification nécessaire ici. Fonction séparée de l'action serveur
 * (src/lib/actions/recrutement.ts) pour rester testable sans session HTTP,
 * même principe que approuverRegularisation() (src/lib/rh/regularisation.ts).
 */
export async function convertirCandidatureEnInvitation(
  tx: TransactionDrizzle,
  entrepriseId: string,
  candidatureId: string,
  roleProposee: "MANAGER" | "EMPLOYE",
  typeContratPropose: "CDI" | "CDD" | "STAGE" | "PRESTATAIRE",
  dateEmbauchePropose: Date
): Promise<ResultatConversion> {
  const [laCandidature] = await tx
    .select({ email: candidature.email, invitationId: candidature.invitationId, posteId: candidature.posteId })
    .from(candidature)
    .where(eq(candidature.id, candidatureId));
  if (!laCandidature) return { erreur: "Candidature introuvable." };
  if (laCandidature.invitationId) return { erreur: "Cette candidature a déjà été convertie." };
  if (!laCandidature.email) return { erreur: "Cette candidature n'a pas d'adresse email — impossible d'envoyer une invitation." };

  const [lePoste] = await tx.select({ titre: posteOuvert.titre }).from(posteOuvert).where(eq(posteOuvert.id, laCandidature.posteId));

  const jeton = generateRandomString(32, "a-z", "A-Z", "0-9");
  const [nouvelleInvitation] = await tx
    .insert(invitation)
    .values({
      entrepriseId,
      email: laCandidature.email,
      roleProposee,
      postePropose: lePoste?.titre,
      typeContratPropose,
      dateEmbauchePropose,
      jeton,
      expireLe: new Date(Date.now() + DUREE_EXPIRATION_INVITATION_MS),
    })
    .returning({ id: invitation.id });

  await tx.update(candidature).set({ statut: "EMBAUCHE", invitationId: nouvelleInvitation.id }).where(eq(candidature.id, candidatureId));

  return { succes: `Invitation créée : /invitation/${jeton}` };
}
