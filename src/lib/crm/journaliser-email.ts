import type { TransactionDrizzle } from "@/db/client";
import { interaction, emailEnvoye } from "@/db/schema";

/**
 * Copie conservée d'un email envoyé (la « souche ») : ce qui est parti, tel quel — destinataire, objet, corps HTML et
 * noms des pièces jointes (les pièces elles-mêmes ne sont pas gardées). Affichée dans Paramètres → Emails envoyés.
 */
export type SoucheEmail = {
  destinataire: string;
  html: string;
  piecesJointes?: { nom: string; taille: number }[];
  /** « DEVIS », « FACTURE », « RELANCE »… — libellé libre qui sert de filtre dans la liste. */
  type: string;
};

/** Raccourci pour décrire les pièces jointes d'un envoi (nom et taille en octets). */
export function resumePiecesJointes(pieces?: { filename: string; content: Buffer }[]): { nom: string; taille: number }[] {
  return (pieces ?? []).map((p) => ({ nom: p.filename, taille: p.content.length }));
}

/**
 * Journalise un email envoyé à un Contact comme interaction CRM (type "email"), pour que la fiche Contact
 * (Historique) reste le reflet fidèle de tout ce qui a réellement été envoyé, pas seulement des notes manuelles —
 * à appeler juste après un envoyerEmail() réussi, dans la même transaction déjà ouverte à chaque site d'appel.
 * `auteurId` est nul pour un envoi automatique (relance de facture, confirmation après acceptation publique d'un
 * devis) : aucun utilisateur humain déclencheur. Avec `souche`, la copie complète de l'email est aussi conservée.
 */
export async function journaliserEmailEnvoye(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; contactId: string; auteurId: string | null; sujet: string; souche?: SoucheEmail }
): Promise<void> {
  await tx.insert(interaction).values({
    entrepriseId: params.entrepriseId,
    contactId: params.contactId,
    type: "email",
    contenu: params.sujet,
    auteurId: params.auteurId,
  });
  if (params.souche) {
    await tx.insert(emailEnvoye).values({
      entrepriseId: params.entrepriseId,
      contactId: params.contactId,
      auteurId: params.auteurId,
      destinataire: params.souche.destinataire,
      sujet: params.sujet,
      corpsHtml: params.souche.html,
      piecesJointes: params.souche.piecesJointes ?? [],
      type: params.souche.type,
    });
  }
}
