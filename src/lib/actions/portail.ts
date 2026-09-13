"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { categorieTicketSupport, ticketSupport, messageTicketSupport } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peutVoirTicketSupport, resoudreMonContact } from "@/lib/portail/acces";

/**
 * Actions du portail client (role CLIENT) — ne passent jamais par
 * peut()/portee(), qui ne concernent que les rôles internes : l'isolation
 * vient directement de resoudreMonContact(), jamais d'une portée EQUIPE/TOUT.
 */

export type EtatPortail = { erreur?: string } | null;

const schemaTicket = z.object({
  categorieId: z.string().min(1, "La catégorie est requise."),
  titre: z.string().trim().min(1, "Le titre est requis."),
  description: z.string().trim().optional(),
});

export async function creerTicketSupportPortail(_etat: EtatPortail, formData: FormData): Promise<EtatPortail> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "CLIENT") return { erreur: "Accès réservé au portail client." };

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
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return { erreur: "Votre compte n'est lié à aucun profil client." };

    const [laCategorie] = await tx.select({ agentId: categorieTicketSupport.agentId }).from(categorieTicketSupport).where(eq(categorieTicketSupport.id, categorieId));
    if (!laCategorie) return { erreur: "Catégorie introuvable." };

    await tx.insert(ticketSupport).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      categorieId,
      contactId: monContact.id,
      titre,
      description,
      assigneAId: laCategorie.agentId,
    });

    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath("/portail");
  return null;
}

const schemaMessage = z.object({ contenu: z.string().trim().min(1, "Le message ne peut pas être vide.") });

export async function ajouterMessagePortail(ticketId: string, _etat: EtatPortail, formData: FormData): Promise<EtatPortail> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "CLIENT") return { erreur: "Accès réservé au portail client." };

  const analyse = schemaMessage.safeParse({ contenu: formData.get("contenu") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Message invalide." };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return { erreur: "Votre compte n'est lié à aucun profil client." };

    const [leTicket] = await tx.select().from(ticketSupport).where(eq(ticketSupport.id, ticketId));
    if (!leTicket) return { erreur: "Ticket introuvable." };
    if (!peutVoirTicketSupport(utilisateurConnecte, monContact.id, leTicket)) return { erreur: "Vous n'avez pas accès à ce ticket." };

    await tx.insert(messageTicketSupport).values({ entrepriseId: utilisateurConnecte.entrepriseId, ticketId, auteurContactId: monContact.id, contenu: analyse.data.contenu });
    return null;
  });

  if (resultat?.erreur) return resultat;

  revalidatePath(`/portail/tickets/${ticketId}`);
  return null;
}
