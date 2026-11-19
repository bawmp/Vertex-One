"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { entreprise, lead, relanceProspect } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { expediteurDe } from "@/lib/email/expediteur";
import { elementsACompleter } from "@/lib/email/modeles";
import { validerPiecesEmail } from "@/lib/email/pieces-jointes";
import { convertirLead } from "@/lib/crm/conversion";
import { envoyerEmailAuProspect, honorerRappel } from "@/lib/crm/relance-email";
import { LONGUEUR_MAX_RELANCE, NB_MAX_ENVOIS_GROUPES, lienWhatsApp, remplirModeleRelance } from "@/lib/crm/prospects";
import { DELAI_MAX_JOURS, PLAFOND_MAX, ecrireDelais, lireDelais } from "@/lib/crm/sequence-prospects";
import { aujourdhuiDouala, ajouterJours, estJourValide } from "@/lib/facturation/promesse-regles";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatProspect = { erreur?: string; envoye?: boolean; ok?: boolean } | null;

const JOURS_MAX_RAPPEL = 365;

/**
 * Un prospect n'est jamais lu « tel quel » depuis l'identifiant reçu du navigateur : on le relit en base (RLS = la bonne entreprise), on vérifie la
 * portée CRM de la personne connectée (un Manager ou un Employé n'agit que sur les siens) et qu'il n'est pas déjà devenu client.
 */
async function prospectAccessible(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, leadId: string) {
  const [ligne] = await tx.select().from(lead).where(eq(lead.id, leadId));
  if (!ligne || ligne.convertiLe) return null;
  const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
  if (visibles !== "TOUT" && !visibles.includes(ligne.assigneAId)) return null;
  return ligne;
}

const schemaEmail = z.object({
  leadId: z.string().min(1),
  objet: z.string().trim().min(3, m("L'objet est trop court.")).max(200, m("L'objet est trop long (200 caractères au plus).")),
  message: z.string().trim().min(5, m("Le message est trop court.")).max(LONGUEUR_MAX_RELANCE, m("Le message est trop long.")),
});

/**
 * Relancer un prospect par e-mail : l'e-mail PART RÉELLEMENT (Resend), au nom de l'entreprise, et la réponse arrive à la personne qui écrit. L'adresse
 * est relue en base (jamais une valeur du navigateur). Le texte part tel quel : un élément « [à compléter] » oublié bloque l'envoi. Chaque envoi est
 * gardé dans l'historique du prospect ET dans Paramètres → Emails envoyés.
 */
export async function relancerProspectParEmail(_etat: EtatProspect, formData: FormData): Promise<EtatProspect> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de relancer ce prospect.") };

  const analyse = schemaEmail.safeParse({ leadId: formData.get("leadId"), objet: formData.get("objet"), message: formData.get("message") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const aCompleter = elementsACompleter(`${d.objet}\n${d.message}`);
  if (aCompleter.length > 0) return { erreur: t("Complétez ou retirez : {elements}.", { elements: aCompleter.join(", ") }) };

  const pieces = await validerPiecesEmail(formData.getAll("fichiers"));
  if (!pieces.ok) return { erreur: t(pieces.erreur.cle, pieces.erreur.valeurs) };
  const piecesJointes = pieces.pieces;

  // Temps 1 (transaction courte) : relire le prospect avec sa portée et l'expéditeur. Temps 2 : l'envoi, HORS transaction, puis la journalisation (seulement s'il est parti).
  const preparation = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, d.leadId);
    if (!p) return { erreur: t("Prospect introuvable."), p: null, expediteur: null };
    if (!p.email) return { erreur: t("Ce prospect n'a pas d'adresse e-mail renseignée."), p: null, expediteur: null };
    return { erreur: null, p, expediteur: await expediteurDe(tx, utilisateurConnecte) };
  });
  if (preparation.erreur !== null || !preparation.p?.email) return { erreur: preparation.erreur ?? t("Prospect introuvable.") };

  const r = await envoyerEmailAuProspect({
    entrepriseId: utilisateurConnecte.entrepriseId,
    leadId: preparation.p.id,
    rappelLe: preparation.p.rappelLe,
    destinataire: preparation.p.email,
    objet: d.objet,
    message: d.message,
    pieces: piecesJointes,
    auteurId: utilisateurConnecte.utilisateurId,
    automatique: false,
    expediteur: preparation.expediteur,
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${d.leadId}`);
  return r.envoye ? { envoye: true } : { erreur: r.erreur ?? t("Échec de l'envoi de l'e-mail.") };
}

export type RaisonNonEnvoye = { nom: string; raison: string };
export type EtatEnvoiGroupe = { erreur?: string; resultat?: { envoyes: number; ignores: RaisonNonEnvoye[]; echecs: RaisonNonEnvoye[] } } | null;

const schemaGroupe = z.object({
  objet: z.string().trim().min(3, m("L'objet est trop court.")).max(200, m("L'objet est trop long (200 caractères au plus).")),
  message: z.string().trim().min(5, m("Le message est trop court.")).max(LONGUEUR_MAX_RELANCE, m("Le message est trop long.")),
});

/**
 * Envoyer le MÊME message à plusieurs prospects (50 au plus), personnalisé pour chacun : `{nom}` et `{entreprise}` sont remplacés à l'envoi pour chaque
 * destinataire. Chaque prospect est relu en base avec la portée de la personne connectée ; ceux qui n'ont pas d'adresse, qui sont déjà clients ou qui sont
 * hors de sa portée sont ignorés (et listés), jamais envoyés. Chaque envoi est noté dans l'historique du prospect. Les envois partent l'un après l'autre,
 * hors de toute transaction ; un échec ne bloque pas les suivants et n'écrit rien pour lui.
 */
export async function relancerProspectsParEmail(_etat: EtatEnvoiGroupe, formData: FormData): Promise<EtatEnvoiGroupe> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de relancer ces prospects.") };

  const analyse = schemaGroupe.safeParse({ objet: formData.get("objet"), message: formData.get("message") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const ids = [...new Set(formData.getAll("leadIds").map(String).filter(Boolean))];
  if (ids.length === 0) return { erreur: t("Sélectionnez au moins un prospect.") };
  if (ids.length > NB_MAX_ENVOIS_GROUPES) return { erreur: t("Un envoi groupé est limité à {n} prospects.", { n: NB_MAX_ENVOIS_GROUPES }) };

  const aCompleter = elementsACompleter(`${d.objet}\n${d.message}`);
  if (aCompleter.length > 0) return { erreur: t("Complétez ou retirez : {elements}.", { elements: aCompleter.join(", ") }) };

  const pieces = await validerPiecesEmail(formData.getAll("fichiers"));
  if (!pieces.ok) return { erreur: t(pieces.erreur.cle, pieces.erreur.valeurs) };

  const preparation = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const expediteur = await expediteurDe(tx, utilisateurConnecte);
    const aEnvoyer: { id: string; nom: string; email: string; rappelLe: string | null }[] = [];
    const ignores: RaisonNonEnvoye[] = [];
    for (const id of ids) {
      const p = await prospectAccessible(tx, utilisateurConnecte, id);
      if (!p) ignores.push({ nom: t("Prospect introuvable"), raison: t("Introuvable, hors de votre portée ou déjà client.") });
      else if (!p.email) ignores.push({ nom: p.nom, raison: t("Pas d'adresse e-mail.") });
      else aEnvoyer.push({ id: p.id, nom: p.nom, email: p.email, rappelLe: p.rappelLe });
    }
    return { expediteur, aEnvoyer, ignores };
  });

  const entrepriseNom = preparation.expediteur.nomExpediteur ?? "";
  let envoyes = 0;
  const echecs: RaisonNonEnvoye[] = [];
  for (const p of preparation.aEnvoyer) {
    const valeurs = { nom: p.nom, entreprise: entrepriseNom };
    const r = await envoyerEmailAuProspect({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      rappelLe: p.rappelLe,
      destinataire: p.email,
      objet: remplirModeleRelance(d.objet, valeurs),
      message: remplirModeleRelance(d.message, valeurs),
      pieces: pieces.pieces,
      auteurId: utilisateurConnecte.utilisateurId,
      automatique: false,
      expediteur: preparation.expediteur,
    });
    if (r.envoye) envoyes += 1;
    else echecs.push({ nom: p.nom, raison: r.erreur ?? t("Échec de l'envoi de l'e-mail.") });
  }

  revalidatePath("/app/prospects");
  return { resultat: { envoyes, ignores: preparation.ignores, echecs } };
}

/**
 * Relancer sur WhatsApp : renvoie le lien qui ouvre la conversation avec le message déjà écrit, et note la relance dans l'historique. L'envoi lui-même
 * est fait par la personne dans son WhatsApp (aucun message ne part de Vertex One) : l'historique dit « ouvert », jamais « délivré ».
 */
export async function ouvrirRelanceWhatsApp(leadId: string, message: string): Promise<{ lien?: string; erreur?: string }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de relancer ce prospect.") };

  const texte = String(message ?? "").trim();
  if (texte.length < 2) return { erreur: t("Le message est vide.") };
  if (texte.length > 1500) return { erreur: t("Le message est trop long pour WhatsApp (1 500 caractères au plus).") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    const lien = lienWhatsApp(p.telephone, texte);
    if (!lien) return { erreur: t("Le numéro de ce prospect n'est pas utilisable sur WhatsApp.") };
    await tx.insert(relanceProspect).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      canal: "whatsapp",
      contenu: texte,
      auteurId: utilisateurConnecte.utilisateurId,
    });
    await honorerRappel(tx, p);
    return { lien };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${leadId}`);
  return resultat;
}

const schemaNote = z.object({
  leadId: z.string().min(1),
  canal: z.enum(["appel", "note"]),
  contenu: z.string().trim().min(2, m("Écrivez au moins quelques mots.")).max(LONGUEUR_MAX_RELANCE, m("Le texte est trop long.")),
});

/** Noter un appel passé ou une remarque dans l'historique du prospect (rien n'est envoyé). */
export async function noterRelanceProspect(_etat: EtatProspect, formData: FormData): Promise<EtatProspect> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce prospect.") };

  const analyse = schemaNote.safeParse({ leadId: formData.get("leadId"), canal: formData.get("canal"), contenu: formData.get("contenu") });
  if (!analyse.success) return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  const d = analyse.data;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatProspect> => {
    const p = await prospectAccessible(tx, utilisateurConnecte, d.leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    await tx.insert(relanceProspect).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      canal: d.canal,
      contenu: d.contenu,
      auteurId: utilisateurConnecte.utilisateurId,
    });
    await honorerRappel(tx, p);
    return { ok: true };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${d.leadId}`);
  return resultat;
}

/** Fixer (AAAA-MM-JJ, de aujourd'hui à un an) ou retirer (`null`) le jour où l'équipe veut relancer ce prospect. */
export async function definirRappelProspect(leadId: string, jour: string | null): Promise<{ erreur?: string; ok?: boolean }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce prospect.") };

  if (jour !== null) {
    const aujourdhui = aujourdhuiDouala();
    if (!estJourValide(jour)) return { erreur: t("Date invalide.") };
    if (jour < aujourdhui) return { erreur: t("Choisissez aujourd'hui ou une date à venir.") };
    if (jour > ajouterJours(aujourdhui, JOURS_MAX_RAPPEL)) return { erreur: t("Le rappel ne peut pas dépasser un an.") };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    await tx.update(lead).set({ rappelLe: jour }).where(and(eq(lead.id, p.id)));
    return { ok: true };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${leadId}`);
  return resultat;
}

/**
 * « Devenir client » : le SEUL passage d'un prospect vers les Contacts. Réservé à un lead QUALIFIÉ ; crée le Contact (et le Compte si une société est
 * renseignée) et le Deal, puis ouvre la fiche du nouveau Contact.
 */
export async function devenirClient(leadId: string): Promise<{ erreur: string } | never> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce prospect.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, leadId);
    if (!p) return { erreur: t("Prospect introuvable ou déjà devenu client.") };
    if (p.statut !== "QUALIFIE") return { erreur: t("Qualifiez d'abord ce lead : seul un prospect qualifié peut devenir client.") };
    const r = await convertirLead(tx, { entrepriseId: utilisateurConnecte.entrepriseId, leadId: p.id, modifieParId: utilisateurConnecte.utilisateurId });
    if (!r) return { erreur: t("Prospect introuvable ou déjà devenu client.") };
    return { contactId: r.contactId };
  });

  revalidatePath("/app/prospects");
  revalidatePath("/app/leads");
  revalidatePath("/app/contacts");
  if (resultat.erreur !== undefined || !resultat.contactId) return { erreur: resultat.erreur ?? t("Prospect introuvable ou déjà devenu client.") };
  redirect(`/app/contacts/${resultat.contactId}`);
}

/**
 * Réglages de la relance automatique (Paramètres) : activer ou non, délais en jours après la qualification (1 à 3 valeurs croissantes, ex. « 3, 7, 14 »),
 * plafond d'e-mails automatiques par jour. Réservé à qui peut modifier les paramètres ; chaque valeur est revalidée ici (jamais prise telle quelle).
 * Désactivée par défaut : elle envoie des e-mails à vos prospects sans que personne ne clique.
 */
export async function definirSequenceProspects(valeurs: { active: boolean; delais: string; plafond: number }): Promise<{ erreur?: string; ok?: boolean }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut modifier ce réglage.") };

  const delais = lireDelais(valeurs.delais);
  if (!delais) return { erreur: t("Délais invalides : indiquez de 1 à 3 nombres de jours croissants (de 1 à {max}), par exemple 3, 7, 14.", { max: DELAI_MAX_JOURS }) };
  const plafond = Number(valeurs.plafond);
  if (!Number.isInteger(plafond) || plafond < 1 || plafond > PLAFOND_MAX) return { erreur: t("Le plafond par jour doit être un nombre entier de 1 à {max}.", { max: PLAFOND_MAX }) };

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(entreprise)
      .set({ sequenceProspectsActive: valeurs.active === true, sequenceProspectsDelais: ecrireDelais(delais), sequenceProspectsPlafond: plafond })
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app/parametres/relance-prospects");
  revalidatePath("/app/prospects");
  return { ok: true };
}

/** Arrête la séquence d'UN prospect et note pourquoi dans son historique (rien n'est envoyé). */
async function arreterSequence(leadId: string, motif: "a_repondu" | "manuel"): Promise<{ erreur?: string; ok?: boolean }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce prospect.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    await tx.update(lead).set({ sequenceArreteeLe: new Date(), sequenceArretMotif: motif }).where(eq(lead.id, p.id));
    await tx.insert(relanceProspect).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      canal: "note",
      contenu: motif === "a_repondu" ? "Le prospect a répondu : les relances automatiques sont arrêtées." : "Les relances automatiques de ce prospect sont arrêtées.",
      auteurId: utilisateurConnecte.utilisateurId,
    });
    return { ok: true };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${leadId}`);
  return resultat;
}

/** « Il a répondu » : la séquence automatique s'arrête (c'est à l'équipe de poursuivre la conversation). */
export async function marquerAReponduProspect(leadId: string) {
  return arreterSequence(leadId, "a_repondu");
}

/** Arrêter les relances automatiques d'un prospect sans qu'il ait répondu. */
export async function arreterSequenceProspect(leadId: string) {
  return arreterSequence(leadId, "manuel");
}

/** Reprendre la séquence là où elle s'était arrêtée (le prochain e-mail part au prochain passage si son jour est arrivé). */
export async function reprendreSequenceProspect(leadId: string): Promise<{ erreur?: string; ok?: boolean }> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "CRM", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier ce prospect.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const p = await prospectAccessible(tx, utilisateurConnecte, leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    await tx.update(lead).set({ sequenceArreteeLe: null, sequenceArretMotif: null }).where(eq(lead.id, p.id));
    await tx.insert(relanceProspect).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      canal: "note",
      contenu: "Les relances automatiques de ce prospect reprennent.",
      auteurId: utilisateurConnecte.utilisateurId,
    });
    return { ok: true };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${leadId}`);
  return resultat;
}
