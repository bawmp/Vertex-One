import { echapper } from "@/lib/notifications/equipe";

/** Emails du circuit « le Manager demande, l'Administrateur confirme ». Tout ce qui a été saisi est échappé avant d'entrer dans le HTML. */
type Courrier = { sujet: string; html: string };
const lien = (base: string) => `${base.replace(/\/+$/, "")}/app/rh/a-confirmer`;

/** À l'Administrateur : une fiche attend sa confirmation (aucune invitation n'est partie). */
export function gabaritDemandeDeposee(p: { manager: string; poste: string; contrat: string; email: string; base: string }): Courrier {
  return {
    sujet: `Fiche à confirmer : ${p.poste}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p><strong>${echapper(p.manager)}</strong> souhaite ajouter un collaborateur : <strong>${echapper(p.poste)}</strong> (${echapper(p.contrat)}), ${echapper(p.email)}.</p>`,
      `<p>Aucune invitation n'est envoyée tant que vous n'avez pas confirmé. Vous pouvez corriger les informations, puis renseigner son salaire sur sa fiche une fois son compte activé.</p>`,
      `<p><a href="${echapper(lien(p.base))}">Confirmer ou refuser la fiche</a></p>`,
    ].join(""),
  };
}

/** Au Manager : l'Administrateur a confirmé, l'invitation est partie. */
export function gabaritDemandeConfirmee(p: { poste: string; email: string; base: string }): Courrier {
  return {
    sujet: `Fiche confirmée : ${p.poste}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>L'Administrateur a <strong>confirmé</strong> la fiche « ${echapper(p.poste)} ». Une invitation vient d'être envoyée à ${echapper(p.email)} ; la fiche se crée dès que la personne active son compte.</p>`,
      `<p><a href="${echapper(lien(p.base))}">Voir mes demandes</a></p>`,
    ].join(""),
  };
}

/** Au Manager : l'Administrateur a refusé (avec un motif éventuel). */
export function gabaritDemandeRefusee(p: { poste: string; email: string; motif: string | null; base: string }): Courrier {
  return {
    sujet: `Fiche refusée : ${p.poste}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>L'Administrateur n'a pas confirmé la fiche « ${echapper(p.poste)} » (${echapper(p.email)}). Aucune invitation n'a été envoyée.</p>`,
      p.motif ? `<p>Motif : « ${echapper(p.motif)} »</p>` : "",
      `<p><a href="${echapper(lien(p.base))}">Voir mes demandes</a></p>`,
    ].filter(Boolean).join(""),
  };
}
