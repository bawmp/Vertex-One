import type { TransactionDrizzle } from "@/db/client";
import { interaction } from "@/db/schema";

/**
 * Journalise un email envoyé à un Contact comme interaction CRM (type "email"), pour que la fiche Contact
 * (Historique) reste le reflet fidèle de tout ce qui a réellement été envoyé, pas seulement des notes manuelles —
 * à appeler juste après un envoyerEmail() réussi, dans la même transaction déjà ouverte à chaque site d'appel.
 * `auteurId` est nul pour un envoi automatique (relance de facture, confirmation après acceptation publique d'un
 * devis) : aucun utilisateur humain déclencheur.
 */
export async function journaliserEmailEnvoye(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; contactId: string; auteurId: string | null; sujet: string }
): Promise<void> {
  await tx.insert(interaction).values({
    entrepriseId: params.entrepriseId,
    contactId: params.contactId,
    type: "email",
    contenu: params.sujet,
    auteurId: params.auteurId,
  });
}
