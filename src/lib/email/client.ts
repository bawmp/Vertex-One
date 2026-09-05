import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Expéditeur de test Resend — tant qu'aucun domaine n'est vérifié sur le
// compte (resend.com/domains), Resend n'autorise l'envoi qu'à l'adresse
// propriétaire du compte, quel que soit le destinataire demandé (confirmé
// par un envoi réel refusé avec l'erreur "You can only send testing emails
// to your own email address"). Remplacer par une adresse sur un domaine
// Vertex One vérifié (ex: "Vertex One <notifications@vertexone.app>") dès
// qu'un domaine est ajouté et vérifié côté Resend — voir docs/strategie-*,
// email transactionnel.
const EXPEDITEUR_PAR_DEFAUT = "Vertex One <onboarding@resend.dev>";

/**
 * Même traitement que Migadu/NotchPay (voir CLAUDE.md) : le code est réel et
 * prêt, mais n'envoie rien tant que RESEND_API_KEY n'est pas configurée —
 * un avertissement clair plutôt qu'un échec silencieux, pour qu'un
 * développeur qui teste en local comprenne pourquoi aucun mail n'arrive.
 */
export async function envoyerEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ envoye: boolean; erreur?: string }> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY non configurée — email non envoyé (destinataire: ${to}, sujet: "${subject}")`);
    return { envoye: false, erreur: "RESEND_API_KEY non configurée" };
  }

  const { error } = await resend.emails.send({ from: EXPEDITEUR_PAR_DEFAUT, to, subject, html });

  if (error) {
    console.error(`[email] échec d'envoi à ${to} :`, error.message);
    return { envoye: false, erreur: error.message };
  }

  return { envoye: true };
}
