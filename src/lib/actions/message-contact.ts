"use server";

import { z } from "zod";
import { envoyerEmail } from "@/lib/email/client";

const schemaMessageContact = z.object({
  nom: z.string().trim().min(2, "Votre nom est trop court."),
  email: z.email("Adresse email invalide."),
  entreprise: z.string().trim().optional(),
  message: z.string().trim().min(10, "Votre message est un peu court — donnez-nous un peu plus de détails."),
});

export type EtatMessageContact = { erreur?: string; succes?: boolean } | null;

/**
 * Formulaire "Contact" du site vitrine (src/app/(marketing)/contact) — sans
 * lien avec le Contact CRM (src/lib/actions/contact.ts, une fiche client).
 * Nommé différemment exprès pour éviter toute collision de fichier.
 *
 * Destinataire configurable (pas codé en dur) — voir .env.example. Soumis
 * aux mêmes limites Resend déjà documentées dans CLAUDE.md ("Resend —
 * domaine non vérifié") : tant qu'aucun domaine n'est vérifié, l'envoi ne
 * part réellement que si cette adresse est celle du propriétaire du compte
 * Resend, sinon envoyerEmail() échoue proprement et logue l'erreur.
 */
export async function envoyerMessageContact(_etat: EtatMessageContact, formData: FormData): Promise<EtatMessageContact> {
  const analyse = schemaMessageContact.safeParse({
    nom: formData.get("nom"),
    email: formData.get("email"),
    entreprise: formData.get("entreprise") || undefined,
    message: formData.get("message"),
  });

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { nom, email, entreprise, message } = analyse.data;
  const destinataire = process.env.CONTACT_DESTINATAIRE;

  if (!destinataire) {
    console.warn("[contact] CONTACT_DESTINATAIRE non configurée — message non envoyé.");
    return { erreur: "Le formulaire de contact n'est pas encore configuré — écrivez-nous directement par email en attendant." };
  }

  const { envoye, erreur } = await envoyerEmail({
    to: destinataire,
    subject: `Nouveau message depuis le site — ${nom}`,
    html: `
      <p><strong>Nom :</strong> ${nom}</p>
      <p><strong>Email :</strong> ${email}</p>
      ${entreprise ? `<p><strong>Entreprise :</strong> ${entreprise}</p>` : ""}
      <p><strong>Message :</strong></p>
      <p>${message.replace(/\n/g, "<br />")}</p>
    `,
  });

  if (!envoye) {
    console.error("[contact] échec d'envoi :", erreur);
    return { erreur: "Votre message n'a pas pu être envoyé pour le moment — réessayez un peu plus tard." };
  }

  return { succes: true };
}
