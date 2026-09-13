"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { categorieTicketSupport, ticketSupport, messageTicketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutVoirTicketSupport, resoudreMonContact } from "@/lib/portail/acces";

const CHEMIN = "/app/support";

export type EtatTicketSupport = { erreur?: string } | null;

const schemaCategorie = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  agentId: z.string().min(1, "L'agent est requis."),
});

/** Réservé à l'Administrateur, même niveau que creerCategorieTicketRH(). */
export async function creerCategorieTicketSupport(_etat: EtatTicketSupport, formData: FormData): Promise<EtatTicketSupport> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") {
    return { erreur: "Seul l'Administrateur peut créer une catégorie." };
  }

  const analyse = schemaCategorie.safeParse({ nom: formData.get("nom"), agentId: formData.get("agentId") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { nom, agentId } = analyse.data;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.insert(categorieTicketSupport).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, agentId }));

  revalidatePath(CHEMIN);
  return null;
}

const STATUTS_VALIDES = ["OUVERT", "EN_COURS", "RESOLU", "FERME"] as const;

/** Réservé à l'agent assigné ou à l'Administrateur — jamais le Contact demandeur. */
export async function changerStatutTicketSupport(ticketId: string, statut: (typeof STATUTS_VALIDES)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  // Revérifié à l'exécution — même garde que changerStatutTicket() (RH),
  // jamais fait confiance à une valeur castée côté client.
  if (!STATUTS_VALIDES.includes(statut)) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketId));
    if (!leTicket) return;
    const estAgent = utilisateurConnecte.utilisateurId === leTicket.assigneAId;
    if (!estAgent && utilisateurConnecte.role !== "ADMIN") return;

    await tx
      .update(ticketSupport)
      .set({ statut, resoluLe: statut === "RESOLU" ? new Date() : leTicket.resoluLe })
      .where(eq(ticketSupport.id, ticketId));
  });

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${ticketId}`);
}

/** Réassignation : décision administrative, jamais laissée à l'agent lui-même. */
export async function reassignerTicketSupport(ticketId: string, nouvelAgentId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(ticketSupport).set({ assigneAId: nouvelAgentId }).where(eq(ticketSupport.id, ticketId)));

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${ticketId}`);
}

const schemaMessage = z.object({ contenu: z.string().trim().min(1, "Le message ne peut pas être vide.") });

/** Réponse d'un agent interne — auteurUtilisateurId renseigné, jamais auteurContactId. */
export async function ajouterMessageTicketSupport(ticketId: string, _etat: EtatTicketSupport, formData: FormData): Promise<EtatTicketSupport> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "SUPPORT", "VOIR")) {
    return { erreur: "Vous n'avez pas accès à ce ticket." };
  }

  const analyse = schemaMessage.safeParse({ contenu: formData.get("contenu") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Message invalide." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketId));
    if (!leTicket) return { erreur: "Ticket introuvable." };
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!peutVoirTicketSupport(utilisateurConnecte, monContact?.id ?? null, leTicket)) return { erreur: "Vous n'avez pas accès à ce ticket." };

    await tx.insert(messageTicketSupport).values({ entrepriseId: utilisateurConnecte.entrepriseId, ticketId, auteurUtilisateurId: utilisateurConnecte.utilisateurId, contenu: analyse.data.contenu });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/${ticketId}`);
  return null;
}
