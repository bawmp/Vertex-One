import { echapper } from "@/lib/notifications/equipe";

/** Emails du transfert d'un employé. Texte pur ; tout ce qui a été saisi ou lu en base est échappé avant d'entrer dans le HTML. */
type Courrier = { sujet: string; html: string };

function lien(base: string): string {
  return `${base.replace(/\/+$/, "")}/app/rh/transferts`;
}

/** À l'Administrateur de l'entreprise d'accueil : une demande attend sa réponse. */
export function gabaritTransfertPropose(p: { personne: string; poste: string | null; origine: string; propose: string; message: string | null; base: string }): Courrier {
  return {
    sujet: `Demande de transfert : ${p.personne} (${p.origine})`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>${echapper(p.propose)}, de <strong>${echapper(p.origine)}</strong>, propose de transférer <strong>${echapper(p.personne)}</strong>${p.poste ? ` (${echapper(p.poste)})` : ""} dans votre entreprise.</p>`,
      p.message ? `<p>Message : « ${echapper(p.message)} »</p>` : "",
      `<p>Rien ne change tant que vous n'avez pas répondu. <a href="${echapper(lien(p.base))}">Accepter ou refuser le transfert</a>.</p>`,
    ].filter(Boolean).join(""),
  };
}

/** À l'Administrateur de l'entreprise d'origine : réponse d'accueil. */
export function gabaritTransfertDecide(p: { personne: string; accueil: string; accepte: boolean; motif: string | null; base: string }): Courrier {
  return {
    sujet: p.accepte ? `Transfert effectué : ${p.personne}` : `Transfert refusé : ${p.personne}`,
    html: [
      `<p>Bonjour,</p>`,
      p.accepte
        ? `<p><strong>${echapper(p.accueil)}</strong> a accepté le transfert de <strong>${echapper(p.personne)}</strong>. Son compte a quitté votre entreprise ; son historique (salaire, congés, évaluations, fichiers) reste chez vous, archivé.</p>`
        : `<p><strong>${echapper(p.accueil)}</strong> a refusé le transfert de <strong>${echapper(p.personne)}</strong>. Rien n'a changé dans votre entreprise.</p>`,
      !p.accepte && p.motif ? `<p>Motif : « ${echapper(p.motif)} »</p>` : "",
      `<p><a href="${echapper(lien(p.base))}">Voir les transferts</a>.</p>`,
    ].filter(Boolean).join(""),
  };
}

/** À la personne transférée : elle garde son adresse et son mot de passe. */
export function gabaritTransfertPersonne(p: { nom: string; accueil: string; origine: string; base: string }): Courrier {
  return {
    sujet: `Vous rejoignez ${p.accueil}`,
    html: [
      `<p>Bonjour ${echapper(p.nom)},</p>`,
      `<p>Votre compte a été transféré de <strong>${echapper(p.origine)}</strong> vers <strong>${echapper(p.accueil)}</strong>.</p>`,
      `<p>Vous vous connectez avec la <strong>même adresse et le même mot de passe</strong> : reconnectez-vous une fois (vos sessions ont été fermées). Votre fiche vous attend dans votre nouvelle entreprise ; votre salaire y sera renseigné par son Administrateur.</p>`,
      `<p><a href="${echapper(p.base.replace(/\/+$/, ""))}/connexion">Se connecter</a></p>`,
    ].join(""),
  };
}
