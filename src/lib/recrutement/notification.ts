import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { candidature, entreprise, parametreRecrutement, posteOuvert, utilisateur } from "@/db/schema";
import { echapperHtml } from "@/lib/email/modeles";

export type StatutCandidature = "RECUE" | "EN_EXAMEN" | "ENTRETIEN" | "OFFRE" | "EMBAUCHE" | "REJETEE";

type Texte = { objet: (poste: string) => string; corps: (poste: string, entreprise: string) => string };

/**
 * Ce que le candidat apprend à chaque étape. Le ton reste sobre et ne promet rien que l'entreprise n'a pas décidé :
 * « Offre » annonce qu'une proposition va suivre, jamais ses conditions. « Reçue » n'envoie rien (c'est l'état de départ,
 * et le statut que prend une candidature rétablie).
 */
const TEXTES: Record<Exclude<StatutCandidature, "RECUE">, Texte> = {
  EN_EXAMEN: {
    objet: (poste) => `Votre candidature « ${poste} » est en cours d'examen`,
    corps: (poste, ent) => `Nous avons bien reçu votre candidature pour le poste « ${poste} » et l'équipe de ${ent} l'examine actuellement. Nous reviendrons vers vous dès que possible.`,
  },
  ENTRETIEN: {
    objet: (poste) => `Entretien pour le poste « ${poste} »`,
    corps: (poste, ent) => `Bonne nouvelle : votre profil a retenu l'attention de ${ent} pour le poste « ${poste} ». Nous vous contacterons très prochainement pour convenir d'un entretien.`,
  },
  OFFRE: {
    objet: (poste) => `Suite de votre candidature « ${poste} »`,
    corps: (poste, ent) => `Après les échanges menés, ${ent} souhaite vous faire une proposition pour le poste « ${poste} ». Nous vous contacterons très prochainement pour vous la présenter.`,
  },
  EMBAUCHE: {
    objet: (poste) => `Bienvenue — poste « ${poste} »`,
    corps: (poste, ent) => `Félicitations ! ${ent} est heureux de vous accueillir pour le poste « ${poste} ». Nous vous contacterons très prochainement pour les prochaines étapes.`,
  },
  REJETEE: {
    objet: (poste) => `Votre candidature « ${poste} »`,
    corps: (poste, ent) =>
      `Nous vous remercions de l'intérêt que vous avez porté au poste « ${poste} » chez ${ent}. Après un examen attentif, nous ne pouvons pas donner suite à votre candidature pour le moment. Nous vous souhaitons plein succès dans vos recherches.`,
  },
};

export type EmailCandidat = { to: string; subject: string; html: string; nomExpediteur: string; replyTo?: string };

/** Gabarit pur (sans accès base) : tout texte venu d'un utilisateur — nom, poste, entreprise — est échappé. */
export function gabaritStatutCandidature(params: { nomCandidat: string; titrePoste: string; nomEntreprise: string; statut: StatutCandidature }): { subject: string; html: string } | null {
  if (params.statut === "RECUE") return null;
  const texte = TEXTES[params.statut];
  const poste = echapperHtml(params.titrePoste);
  const ent = echapperHtml(params.nomEntreprise);
  return {
    subject: texte.objet(params.titrePoste).slice(0, 200),
    html: `<p>Bonjour ${echapperHtml(params.nomCandidat)},</p><p>${texte.corps(poste, ent)}</p><p>Cordialement,<br>${ent}</p>`,
  };
}

/**
 * Change le statut d'une candidature ET prépare l'email du candidat, dans la même transaction (la lecture du statut
 * d'origine et l'écriture ne peuvent pas être séparées par un autre changement). Aucun email n'est préparé quand :
 * le statut ne change pas, le nouveau statut est « Reçue », l'appelant a demandé de ne pas prévenir (annulation,
 * rétablissement), le candidat n'a pas d'adresse, ou l'entreprise a coupé les notifications.
 * L'envoi lui-même est fait par l'appelant, APRÈS la réponse (`after()`), jamais pendant la transaction.
 */
export async function changerStatutEtPreparerEmail(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; utilisateurId: string; candidatureId: string; statut: StatutCandidature; prevenir: boolean }
): Promise<EmailCandidat | null> {
  const { entrepriseId, utilisateurId, candidatureId, statut, prevenir } = params;

  const [avant] = await tx
    .select({ statut: candidature.statut, nom: candidature.nom, email: candidature.email, posteId: candidature.posteId })
    .from(candidature)
    .where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, entrepriseId)));
  if (!avant) return null;

  await tx.update(candidature).set({ statut }).where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, entrepriseId)));

  if (!prevenir || avant.statut === statut || statut === "RECUE" || !avant.email) return null;

  const [reglage] = await tx.select({ notifier: parametreRecrutement.notifierCandidats }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, entrepriseId));
  if (reglage && !reglage.notifier) return null;

  const [poste] = await tx.select({ titre: posteOuvert.titre }).from(posteOuvert).where(and(eq(posteOuvert.id, avant.posteId), eq(posteOuvert.entrepriseId, entrepriseId)));
  const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  // `utilisateur` est en RLS permissive : l'entreprise est filtrée explicitement.
  const [moi] = await tx.select({ email: utilisateur.email }).from(utilisateur).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));

  const gabarit = gabaritStatutCandidature({ nomCandidat: avant.nom, titrePoste: poste?.titre ?? "votre candidature", nomEntreprise: ent?.nom ?? "l'entreprise", statut });
  if (!gabarit) return null;

  return { to: avant.email, subject: gabarit.subject, html: gabarit.html, nomExpediteur: ent?.nom ?? "", replyTo: moi?.email };
}
