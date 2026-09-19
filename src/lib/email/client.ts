import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Domaine vertexone.cm vérifié sur Resend le 2026-09-19 (DKIM/SPF via
// Cloudflare DNS). Avant cette date, seul l'expéditeur de bac à sable
// onboarding@resend.dev était possible, limité à l'adresse propriétaire du
// compte.
const EXPEDITEUR_PAR_DEFAUT = "Vertex One <notifications@vertexone.cm>";

/**
 * Même traitement que Migadu/CinetPay (voir CLAUDE.md) : le code est réel et
 * prêt, mais n'envoie rien tant que RESEND_API_KEY n'est pas configurée —
 * un avertissement clair plutôt qu'un échec silencieux, pour qu'un
 * développeur qui teste en local comprenne pourquoi aucun mail n'arrive.
 */
export async function envoyerEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<{ envoye: boolean; erreur?: string }> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY non configurée — email non envoyé (destinataire: ${to}, sujet: "${subject}")`);
    return { envoye: false, erreur: "RESEND_API_KEY non configurée" };
  }

  const { error } = await resend.emails.send({ from: EXPEDITEUR_PAR_DEFAUT, to, subject, html, attachments });

  if (error) {
    console.error(`[email] échec d'envoi à ${to} :`, error.message);
    return { envoye: false, erreur: error.message };
  }

  return { envoye: true };
}
