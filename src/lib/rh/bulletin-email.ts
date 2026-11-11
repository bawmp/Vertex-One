import "server-only";
import { avecEntreprise } from "@/db/client";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { echapperHtml } from "@/lib/email/modeles";
import { lireBulletin } from "@/lib/rh/paie";
import { rendreBulletinPDF } from "@/lib/rh/bulletin-pdf";
import { libelleMois } from "@/lib/rh/paie-regles";

/**
 * Envoie son bulletin de paie à la personne payée, au nom de l'entreprise. Appelé APRÈS la réponse (`after()`), jamais bloquant : un échec
 * est journalisé et le bulletin reste téléchargeable sur la fiche. L'adresse vient de la base (compte de la personne), jamais du navigateur.
 */
export async function envoyerBulletinParEmail(entrepriseId: string, dossierRHId: string, paiementId: string): Promise<void> {
  try {
    const ligne = await avecEntreprise(entrepriseId, (tx) => lireBulletin(tx, dossierRHId, paiementId));
    if (!ligne?.email) return;
    const mois = libelleMois(ligne.paiement.mois, "fr-FR");
    const pdf = await rendreBulletinPDF(ligne);
    const html =
      (await enteteLogoEmail(entrepriseId)) +
      `<p>Bonjour ${echapperHtml(ligne.nomComplet)},</p><p>Votre salaire de ${echapperHtml(mois)} a été payé. Vous trouverez votre bulletin de paie en pièce jointe.</p><p>Ce document est confidentiel.</p><p>${echapperHtml(ligne.entrepriseNom)}</p>`;
    await envoyerEmail({ to: ligne.email, subject: `Votre bulletin de paie — ${mois}`, html, attachments: [{ filename: `bulletin-${ligne.paiement.mois}.pdf`, content: pdf }], nomExpediteur: ligne.entrepriseNom });
  } catch (erreur) {
    console.error("[paie] envoi du bulletin par email en échec :", erreur instanceof Error ? erreur.message : erreur);
  }
}
