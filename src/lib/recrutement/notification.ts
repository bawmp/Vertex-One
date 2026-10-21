import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { candidature, entreprise, parametreRecrutement, posteOuvert, utilisateur } from "@/db/schema";
import { corpsVersHtml, interpoler, recupererModele, type TypeModeleEmail } from "@/lib/email/modeles";

export type StatutCandidature = "RECUE" | "EN_EXAMEN" | "ENTRETIEN" | "OFFRE" | "EMBAUCHE" | "REJETEE";

/**
 * Le modèle d'email de chaque statut. « Reçue » n'en a pas : c'est l'état de départ, et le statut que prend une
 * candidature rétablie — aucun email n'est envoyé pour lui.
 */
const MODELE_PAR_STATUT: Record<Exclude<StatutCandidature, "RECUE">, TypeModeleEmail> = {
  EN_EXAMEN: "CANDIDATURE_EN_EXAMEN",
  ENTRETIEN: "CANDIDATURE_ENTRETIEN",
  OFFRE: "CANDIDATURE_OFFRE",
  EMBAUCHE: "CANDIDATURE_EMBAUCHE",
  REJETEE: "CANDIDATURE_REJETEE",
};

export function typeModelePourStatut(statut: StatutCandidature): TypeModeleEmail | null {
  return statut === "RECUE" ? null : MODELE_PAR_STATUT[statut];
}

export type EmailCandidat = { to: string; subject: string; html: string; nomExpediteur: string; replyTo?: string };

/**
 * Construit l'email à partir d'un modèle (par défaut ou personnalisé par l'entreprise). Les variables sont insérées
 * dans le TEXTE brut, puis tout le texte est échappé en HTML : un nom de candidat ou un intitulé de poste contenant du
 * HTML ne peut jamais s'afficher comme tel. L'objet est une seule ligne (jamais de saut de ligne dans un en-tête).
 */
export function construireEmailStatut(modele: { objet: string; corps: string }, variables: { candidat: string; poste: string; entreprise: string }): { subject: string; html: string } {
  const valeurs = { candidat: variables.candidat, poste: variables.poste, entreprise: variables.entreprise };
  return {
    subject: interpoler(modele.objet, valeurs).replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, 200),
    html: corpsVersHtml(interpoler(modele.corps, valeurs)),
  };
}

/** Limites du message modifié par l'utilisateur avant l'envoi (jamais fait confiance à la taille envoyée par le navigateur). */
export const LONGUEUR_MAX_OBJET = 200;
export const LONGUEUR_MAX_CORPS = 5000;

export type ContenuEmailPersonnalise = { objet: string; corps: string };

/** Valide le message rédigé par l'utilisateur : texte non vide, objet sur une seule ligne, tailles bornées. Renvoie null s'il est inutilisable. */
export function nettoyerContenuPersonnalise(contenu: { objet?: unknown; corps?: unknown } | undefined | null): ContenuEmailPersonnalise | null {
  if (!contenu || typeof contenu.objet !== "string" || typeof contenu.corps !== "string") return null;
  const objet = contenu.objet.replace(/\s*[\r\n]+\s*/g, " ").trim();
  const corps = contenu.corps.replace(/\r\n/g, "\n").trim();
  if (!objet || !corps || objet.length > LONGUEUR_MAX_OBJET || corps.length > LONGUEUR_MAX_CORPS) return null;
  return { objet, corps };
}

/** Email à partir d'un message déjà rédigé : le texte est échappé en HTML, les variables ne sont PAS réinterprétées (ce que l'utilisateur a écrit part tel quel). */
export function construireEmailPersonnalise(contenu: ContenuEmailPersonnalise): { subject: string; html: string } {
  return { subject: contenu.objet, html: corpsVersHtml(contenu.corps) };
}

export type ApercuEmailStatut = { destinataire: string; objet: string; corps: string };

/**
 * Le message qui PARTIRAIT si l'on passait la candidature à ce statut (modèle de l'entreprise, variables remplacées), pour
 * que l'utilisateur le relise et le modifie avant l'envoi. Lecture seule : ne change rien. Null quand aucun email ne
 * partirait (mêmes conditions que changerStatutEtPreparerEmail : statut inchangé, « Reçue », pas d'adresse, notifications coupées).
 */
export async function apercuEmailStatut(tx: TransactionDrizzle, params: { entrepriseId: string; candidatureId: string; statut: StatutCandidature }): Promise<ApercuEmailStatut | null> {
  const { entrepriseId, candidatureId, statut } = params;
  const [avant] = await tx
    .select({ statut: candidature.statut, nom: candidature.nom, email: candidature.email, posteId: candidature.posteId })
    .from(candidature)
    .where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, entrepriseId)));
  const type = typeModelePourStatut(statut);
  if (!avant || avant.statut === statut || !type || !avant.email) return null;

  const [reglage] = await tx.select({ notifier: parametreRecrutement.notifierCandidats }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, entrepriseId));
  if (reglage && !reglage.notifier) return null;

  const [poste] = await tx.select({ titre: posteOuvert.titre }).from(posteOuvert).where(and(eq(posteOuvert.id, avant.posteId), eq(posteOuvert.entrepriseId, entrepriseId)));
  const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const modele = await recupererModele(tx, entrepriseId, type);
  const valeurs = { candidat: avant.nom, poste: poste?.titre ?? "votre candidature", entreprise: ent?.nom ?? "l'entreprise" };
  return {
    destinataire: avant.email,
    objet: interpoler(modele.objet, valeurs).replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, LONGUEUR_MAX_OBJET),
    corps: interpoler(modele.corps, valeurs),
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
  params: { entrepriseId: string; utilisateurId: string; candidatureId: string; statut: StatutCandidature; prevenir: boolean; contenu?: ContenuEmailPersonnalise | null }
): Promise<EmailCandidat | null> {
  const { entrepriseId, utilisateurId, candidatureId, statut, prevenir, contenu } = params;

  const [avant] = await tx
    .select({ statut: candidature.statut, nom: candidature.nom, email: candidature.email, posteId: candidature.posteId })
    .from(candidature)
    .where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, entrepriseId)));
  if (!avant) return null;

  await tx.update(candidature).set({ statut }).where(and(eq(candidature.id, candidatureId), eq(candidature.entrepriseId, entrepriseId)));

  const type = typeModelePourStatut(statut);
  if (!prevenir || avant.statut === statut || !type || !avant.email) return null;

  const [reglage] = await tx.select({ notifier: parametreRecrutement.notifierCandidats }).from(parametreRecrutement).where(eq(parametreRecrutement.entrepriseId, entrepriseId));
  if (reglage && !reglage.notifier) return null;

  const [poste] = await tx.select({ titre: posteOuvert.titre }).from(posteOuvert).where(and(eq(posteOuvert.id, avant.posteId), eq(posteOuvert.entrepriseId, entrepriseId)));
  const [ent] = await tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  // `utilisateur` est en RLS permissive : l'entreprise est filtrée explicitement.
  const [moi] = await tx.select({ email: utilisateur.email }).from(utilisateur).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));

  // Message relu et modifié par l'utilisateur avant l'envoi : il part tel quel ; sinon, le modèle de l'entreprise.
  const { subject, html } = contenu
    ? construireEmailPersonnalise(contenu)
    : construireEmailStatut(await recupererModele(tx, entrepriseId, type), { candidat: avant.nom, poste: poste?.titre ?? "votre candidature", entreprise: ent?.nom ?? "l'entreprise" });

  return { to: avant.email, subject, html, nomExpediteur: ent?.nom ?? "", replyTo: moi?.email };
}
