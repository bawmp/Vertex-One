import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise, utilisateur } from "@/db/schema";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { echapperHtml } from "@/lib/email/modeles";
import { urlBase } from "@/lib/client-documents/liens";

/**
 * Email d'invitation envoyé à la personne invitée (collaborateur ou client du portail), au nom de l'entreprise avec son logo : elle ouvre le lien,
 * choisit son mot de passe, et se connecte ensuite avec son adresse email et ce mot de passe. Les noms saisis par un utilisateur sont échappés.
 */
export function composerEmailInvitation(params: { nomEntreprise: string; nomInvitant: string; role: string; lien: string; dureeHeures: number; entete?: string }): { subject: string; html: string } {
  const entreprise = echapperHtml(params.nomEntreprise);
  const invitant = echapperHtml(params.nomInvitant);
  const portail = params.role === "CLIENT";
  const poste = params.role === "MANAGER" ? "Manager" : "Employé";
  return {
    subject: portail ? `${params.nomEntreprise.replace(/[\r\n]/g, " ")} vous donne accès à votre espace client` : `${params.nomEntreprise.replace(/[\r\n]/g, " ")} vous invite à rejoindre son équipe sur Vertex One`,
    html: `
      ${params.entete ?? ""}
      <p>Bonjour,</p>
      ${
        portail
          ? `<p><strong>${entreprise}</strong> vous a ouvert un accès à votre espace client.</p>`
          : `<p><strong>${invitant}</strong> vous invite à rejoindre <strong>${entreprise}</strong> sur Vertex One, en tant que <strong>${poste}</strong>.</p>`
      }
      <p><a href="${params.lien}">Créer mon accès</a></p>
      <p>Vous choisirez votre mot de passe (8 caractères minimum). Ensuite, vous vous connecterez avec <strong>cette adresse email</strong> et votre mot de passe.</p>
      <p>Ce lien est personnel et expire dans ${params.dureeHeures} heures. Si vous n'attendiez pas cette invitation, ignorez simplement cet email.</p>
      <p>Cordialement,<br>${entreprise}</p>
    `.trim(),
  };
}

/** Envoie l'email d'invitation ; ne lève jamais (un échec d'envoi n'annule pas l'invitation, le lien reste copiable). */
export async function envoyerEmailInvitation(params: { entrepriseId: string; email: string; role: string; jeton: string; invitantId: string; dureeHeures: number }): Promise<{ envoye: boolean }> {
  try {
    const [e] = await db.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, params.entrepriseId));
    if (!e) return { envoye: false };
    const [invitant] = await db.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(eq(utilisateur.id, params.invitantId));
    const { subject, html } = composerEmailInvitation({
      nomEntreprise: e.nom,
      nomInvitant: invitant?.nom ?? e.nom,
      role: params.role,
      lien: `${urlBase()}/invitation/${params.jeton}`,
      dureeHeures: params.dureeHeures,
      entete: await enteteLogoEmail(params.entrepriseId),
    });
    const { envoye } = await envoyerEmail({ to: params.email, subject, html, nomExpediteur: e.nom });
    return { envoye };
  } catch (erreur) {
    console.error("[invitation] envoi de l'email impossible :", erreur instanceof Error ? erreur.message : erreur);
    return { envoye: false };
  }
}
