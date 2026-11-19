import { eq } from "drizzle-orm";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { emailEnvoye, lead, relanceProspect } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { corpsVersHtml, echapperHtml } from "@/lib/email/modeles";
import type { PieceEmail } from "@/lib/email/pieces-jointes";
import { resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { LONGUEUR_MAX_RELANCE } from "@/lib/crm/prospects";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";

/** Un rappel daté arrivé à échéance est « honoré » dès qu'une relance part : on l'efface pour que le prospect ne reste pas « à relancer ». */
export async function honorerRappel(tx: TransactionDrizzle, ligne: { id: string; rappelLe: string | null }) {
  if (ligne.rappelLe && ligne.rappelLe <= aujourdhuiDouala()) {
    await tx.update(lead).set({ rappelLe: null }).where(eq(lead.id, ligne.id));
  }
}

export type EnvoiEmailProspect = {
  entrepriseId: string;
  leadId: string;
  rappelLe: string | null;
  destinataire: string;
  objet: string;
  message: string;
  pieces?: PieceEmail[];
  /** Personne qui relance (nulle pour un e-mail automatique). */
  auteurId: string | null;
  automatique: boolean;
  /** Nom affiché et adresse de réponse : la réponse du prospect arrive à une vraie personne de l'équipe. */
  expediteur: { nomExpediteur?: string; replyTo?: string };
  /** Ligne ajoutée au bas du message (e-mails automatiques : pourquoi il le reçoit, comment se désabonner). */
  pied?: string;
};

/**
 * Envoie l'e-mail à un prospect, puis — SEULEMENT s'il est vraiment parti — le note dans l'historique du prospect et dans les e-mails envoyés.
 * L'appel réseau se fait HORS de toute transaction (l'appelant n'en tient aucune ouverte pendant l'envoi) : la journalisation ouvre la sienne.
 * Un échec n'écrit rien : jamais une relance « envoyée » sans e-mail parti.
 */
export async function envoyerEmailAuProspect(e: EnvoiEmailProspect): Promise<{ envoye: boolean; erreur?: string }> {
  const pieces = e.pieces ?? [];
  const entete = await enteteLogoEmail(e.entrepriseId);
  const piedHtml = e.pied ? `<p style="margin-top:24px;font-size:12px;color:#6b7280">${echapperHtml(e.pied)}</p>` : "";
  const html = entete + corpsVersHtml(e.message) + piedHtml;

  const { envoye, erreur } = await envoyerEmail({
    to: e.destinataire,
    subject: e.objet,
    html,
    ...(pieces.length > 0 ? { attachments: pieces } : {}),
    ...e.expediteur,
  });
  if (!envoye) return { envoye: false, erreur };

  const noms = pieces.length > 0 ? `\n\nPièces jointes : ${pieces.map((x) => x.filename).join(", ")}` : "";
  await avecEntreprise(e.entrepriseId, async (tx) => {
    await tx.insert(relanceProspect).values({
      entrepriseId: e.entrepriseId,
      leadId: e.leadId,
      canal: "email",
      contenu: `${e.objet}\n\n${e.message}`.slice(0, LONGUEUR_MAX_RELANCE) + noms,
      auteurId: e.auteurId,
      automatique: e.automatique,
    });
    await tx.insert(emailEnvoye).values({
      entrepriseId: e.entrepriseId,
      contactId: null,
      auteurId: e.auteurId,
      destinataire: e.destinataire,
      sujet: e.objet,
      corpsHtml: html,
      piecesJointes: resumePiecesJointes(pieces),
      type: e.automatique ? "PROSPECT_AUTO" : "PROSPECT",
    });
    await honorerRappel(tx, { id: e.leadId, rappelLe: e.rappelLe });
  });
  return { envoye: true };
}
