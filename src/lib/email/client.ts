import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Domaine vertexone.cm vérifié sur Resend le 2026-09-19 (DKIM/SPF via
// Cloudflare DNS). Avant cette date, seul l'expéditeur de bac à sable
// onboarding@resend.dev était possible, limité à l'adresse propriétaire du
// compte.
const ADRESSE_EXPEDITEUR = "notifications@vertexone.cm";
const EXPEDITEUR_PAR_DEFAUT = `Vertex One <${ADRESSE_EXPEDITEUR}>`;

/**
 * Nom affiché de l'expéditeur : celui de l'entreprise qui écrit à son client (un devis arrive de « Beau & Bon
 * Traiteur », pas de « Vertex One »). L'adresse reste celle du domaine vérifié (seule autorisée par Resend). Le nom,
 * saisi par un utilisateur, est nettoyé des caractères qui casseraient l'en-tête (guillemets, chevrons, sauts de ligne).
 */
export function formaterExpediteur(nomExpediteur?: string): string {
  // Le « @ » est retiré aussi : un nom affiché qui ressemble à une adresse tromperait le lecteur sur l'expéditeur.
  const propre = (nomExpediteur ?? "").replace(/[\r\n"<>\\@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return propre ? `"${propre}" <${ADRESSE_EXPEDITEUR}>` : EXPEDITEUR_PAR_DEFAUT;
}

/**
 * Même traitement que Migadu/CinetPay (voir CLAUDE.md) : le code est réel et
 * prêt, mais n'envoie rien tant que RESEND_API_KEY n'est pas configurée —
 * un avertissement clair plutôt qu'un échec silencieux, pour qu'un
 * développeur qui teste en local comprenne pourquoi aucun mail n'arrive.
 *
 * `replyTo` : la réponse du client doit atteindre la personne qui a écrit (ou l'entreprise), pas une boîte
 * d'expédition que personne ne lit.
 */
export async function envoyerEmail({
  to,
  subject,
  html,
  attachments,
  nomExpediteur,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  nomExpediteur?: string;
  replyTo?: string;
}): Promise<{ envoye: boolean; erreur?: string }> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY non configurée — email non envoyé (destinataire: ${to}, sujet: "${subject}")`);
    return { envoye: false, erreur: "RESEND_API_KEY non configurée" };
  }

  const { error } = await resend.emails.send({ from: formaterExpediteur(nomExpediteur), to, subject, html, attachments, ...(replyTo ? { replyTo } : {}) });

  if (error) {
    console.error(`[email] échec d'envoi à ${to} :`, error.message);
    return { envoye: false, erreur: error.message };
  }

  return { envoye: true };
}
