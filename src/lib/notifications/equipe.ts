import { and, eq, inArray } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";

/**
 * Adresses des Administrateurs actifs d'une entreprise, plus éventuellement celles
 * de collaborateurs précis (le commercial responsable du devis, l'auteur de la
 * demande de signature…). Sans doublon. `utilisateur` reste en RLS permissive
 * (Better-Auth) : le filtre entrepriseId est donc explicite ici, jamais déduit.
 */
export async function adressesAAlerter(tx: TransactionDrizzle, entrepriseId: string, utilisateursSupplementairesIds: (string | null | undefined)[] = []): Promise<string[]> {
  const supplementaires = utilisateursSupplementairesIds.filter((id): id is string => Boolean(id));

  const admins = await tx
    .select({ email: utilisateur.email })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.role, "ADMIN"), eq(utilisateur.statut, "ACTIF")));

  const autres = supplementaires.length
    ? await tx
        .select({ email: utilisateur.email })
        .from(utilisateur)
        .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), inArray(utilisateur.id, supplementaires)))
    : [];

  return [...new Set([...admins, ...autres].map((l) => l.email).filter(Boolean))];
}

/**
 * Envoie le même message à plusieurs adresses. Meilleur effort : un échec d'envoi
 * (Resend indisponible, clé absente) est journalisé, jamais remonté à celui qui a
 * déclenché l'action (le client qui vient d'accepter ne doit pas voir d'erreur).
 */
export async function alerterParEmail(adresses: string[], sujet: string, html: string, attachments?: { filename: string; content: Buffer }[]): Promise<void> {
  for (const to of adresses) {
    try {
      await envoyerEmail({ to, subject: sujet, html, attachments });
    } catch (erreur) {
      console.error(`[notifications] échec d'envoi à ${to} :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
}

/** Échappe le texte saisi par un client avant de l'insérer dans un email HTML. */
export function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
