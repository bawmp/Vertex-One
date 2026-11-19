"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise, type TransactionDrizzle } from "@/db/client";
import { emailEnvoye, lead, relanceProspect } from "@/db/schema";
import { recupererUtilisateurConnecte, type UtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { envoyerEmail } from "@/lib/email/client";
import { enteteLogoEmail } from "@/lib/email/logo";
import { expediteurDe } from "@/lib/email/expediteur";
import { corpsVersHtml, elementsACompleter } from "@/lib/email/modeles";
import { validerPiecesEmail } from "@/lib/email/pieces-jointes";
import { resumePiecesJointes } from "@/lib/crm/journaliser-email";
import { convertirLead } from "@/lib/crm/conversion";
import { LONGUEUR_MAX_RELANCE, lienWhatsApp } from "@/lib/crm/prospects";
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

/** Un rappel daté arrivé à échéance est « honoré » dès qu'une relance part : on l'efface pour que le prospect ne reste pas « à relancer ». */
async function honorerRappel(tx: TransactionDrizzle, ligne: { id: string; rappelLe: string | null }) {
  if (ligne.rappelLe && ligne.rappelLe <= aujourdhuiDouala()) {
    await tx.update(lead).set({ rappelLe: null }).where(eq(lead.id, ligne.id));
  }
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

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx): Promise<EtatProspect> => {
    const p = await prospectAccessible(tx, utilisateurConnecte, d.leadId);
    if (!p) return { erreur: t("Prospect introuvable.") };
    if (!p.email) return { erreur: t("Ce prospect n'a pas d'adresse e-mail renseignée.") };

    const expediteur = await expediteurDe(tx, utilisateurConnecte);
    const html = (await enteteLogoEmail(utilisateurConnecte.entrepriseId)) + corpsVersHtml(d.message);
    const { envoye, erreur } = await envoyerEmail({
      to: p.email,
      subject: d.objet,
      html,
      ...(piecesJointes.length > 0 ? { attachments: piecesJointes } : {}),
      ...expediteur,
    });
    if (!envoye) return { erreur: erreur ?? t("Échec de l'envoi de l'e-mail.") };

    const noms = piecesJointes.length > 0 ? `\n\nPièces jointes : ${piecesJointes.map((x) => x.filename).join(", ")}` : "";
    await tx.insert(relanceProspect).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      leadId: p.id,
      canal: "email",
      contenu: `${d.objet}\n\n${d.message}`.slice(0, LONGUEUR_MAX_RELANCE) + noms,
      auteurId: utilisateurConnecte.utilisateurId,
    });
    await tx.insert(emailEnvoye).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      contactId: null,
      auteurId: utilisateurConnecte.utilisateurId,
      destinataire: p.email,
      sujet: d.objet,
      corpsHtml: html,
      piecesJointes: resumePiecesJointes(piecesJointes),
      type: "PROSPECT",
    });
    await honorerRappel(tx, p);
    return { envoye: true };
  });

  revalidatePath("/app/prospects");
  revalidatePath(`/app/leads/${d.leadId}`);
  return resultat;
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
