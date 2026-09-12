"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, categorieTicketRH, ticketRH, messageTicketRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { peutVoirTicket } from "@/lib/rh/ticket";

const CHEMIN = "/app/rh/tickets";

export type EtatTicketRH = { erreur?: string } | null;

const schemaCategorie = z.object({
  nom: z.string().trim().min(1, "Le nom est requis."),
  agentId: z.string().min(1, "L'agent est requis."),
});

/**
 * Catégories (échange du 2026-09-08) — décision structurante, réservée à
 * l'Administrateur (même niveau que creerPolitiqueConge()/creerSondage()).
 */
export async function creerCategorieTicketRH(_etat: EtatTicketRH, formData: FormData): Promise<EtatTicketRH> {
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

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    await tx.insert(categorieTicketRH).values({ entrepriseId: utilisateurConnecte.entrepriseId, nom, agentId });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

const schemaTicket = z.object({
  categorieId: z.string().min(1, "La catégorie est requise."),
  titre: z.string().trim().min(1, "Le titre est requis."),
  description: z.string().trim().optional(),
});

/**
 * Toujours pour soi-même (même choix que creerDemandeConge()/
 * creerDemandeDepart()) — assigneAId hérité de l'agent par défaut de la
 * catégorie, jamais choisi par le demandeur.
 */
export async function creerTicketRH(_etat: EtatTicketRH, formData: FormData): Promise<EtatTicketRH> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RH", "CREER")) {
    return { erreur: "Vous n'avez pas le droit d'ouvrir un ticket." };
  }

  const analyse = schemaTicket.safeParse({
    categorieId: formData.get("categorieId"),
    titre: formData.get("titre"),
    description: formData.get("description") || undefined,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { categorieId, titre, description } = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return { erreur: "Les Ressources Humaines sont disponibles à partir du forfait Business." };

    const [laCategorie] = await tx.select({ agentId: categorieTicketRH.agentId }).from(categorieTicketRH).where(eq(categorieTicketRH.id, categorieId));
    if (!laCategorie) return { erreur: "Catégorie introuvable." };

    await tx.insert(ticketRH).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      categorieId,
      demandeurId: utilisateurConnecte.utilisateurId,
      titre,
      description,
      assigneAId: laCategorie.agentId,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(CHEMIN);
  return null;
}

const STATUTS_VALIDES = ["OUVERT", "EN_COURS", "RESOLU", "FERME"] as const;

/**
 * Réservé à l'agent assigné ou à l'Administrateur — jamais le demandeur
 * lui-même, qui ne fait qu'ouvrir et suivre son ticket.
 */
export async function changerStatutTicket(ticketId: string, statut: (typeof STATUTS_VALIDES)[number]) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  // Le typage TS de statut n'est qu'une annotation côté serveur — la valeur
  // vient réellement d'un onChange côté client (ControlesTicket) qui la
  // caste sans aucune garantie à l'exécution ; revérifiée ici avant tout
  // UPDATE, jamais fait confiance au client (règle CLAUDE.md).
  if (!STATUTS_VALIDES.includes(statut)) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx.select().from(ticketRH).where(eq(ticketRH.id, ticketId));
    if (!leTicket) return;
    const estAgent = utilisateurConnecte.utilisateurId === leTicket.assigneAId;
    if (!estAgent && utilisateurConnecte.role !== "ADMIN") return;

    await tx
      .update(ticketRH)
      .set({ statut, resoluLe: statut === "RESOLU" ? new Date() : leTicket.resoluLe })
      .where(eq(ticketRH.id, ticketId));
  });

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${ticketId}`);
}

/** Réassignation : décision administrative, jamais laissée à l'agent lui-même. */
export async function reassignerTicket(ticketId: string, nouvelAgentId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(ticketRH).set({ assigneAId: nouvelAgentId }).where(eq(ticketRH.id, ticketId)));

  revalidatePath(CHEMIN);
  revalidatePath(`${CHEMIN}/${ticketId}`);
}

const schemaMessage = z.object({ contenu: z.string().trim().min(1, "Le message ne peut pas être vide.") });

export async function ajouterMessageTicket(ticketId: string, _etat: EtatTicketRH, formData: FormData): Promise<EtatTicketRH> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const analyse = schemaMessage.safeParse({ contenu: formData.get("contenu") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Message invalide." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leTicket] = await tx.select().from(ticketRH).where(eq(ticketRH.id, ticketId));
    if (!leTicket) return { erreur: "Ticket introuvable." };
    if (!peutVoirTicket(utilisateurConnecte, leTicket)) return { erreur: "Vous n'avez pas accès à ce ticket." };

    await tx.insert(messageTicketRH).values({ entrepriseId: utilisateurConnecte.entrepriseId, ticketId, auteurId: utilisateurConnecte.utilisateurId, contenu: analyse.data.contenu });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`${CHEMIN}/${ticketId}`);
  return null;
}
