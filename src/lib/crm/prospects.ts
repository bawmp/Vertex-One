import { m } from "@/lib/i18n/catalogue";
import { aujourdhuiDouala, ecartEnJours, estJourValide } from "@/lib/facturation/promesse-regles";
import { telephoneInternational } from "@/lib/paiement/telephone";

/**
 * Prospects qualifiés (2026-11-19) : un lead de statut QUALIFIE, pas encore converti. Il vit dans son propre espace
 * (/app/prospects), se relance par e-mail ou WhatsApp, et ne devient Contact qu'une fois client (« Devenir client »).
 * Règles pures ici (aucun accès à la base) : elles servent aux écrans ET aux tests.
 */

/** Au-delà de ce nombre de jours sans relance, un prospect passe « à relancer » (sans rappel daté). */
export const DELAI_RELANCE_JOURS = 7;

export const CANAUX_RELANCE = ["email", "whatsapp", "appel", "note"] as const;
export type CanalRelance = (typeof CANAUX_RELANCE)[number];

export const LIBELLES_CANAL_RELANCE: Record<CanalRelance, string> = {
  email: m("E-mail"),
  whatsapp: m("WhatsApp"),
  appel: m("Appel"),
  note: m("Note"),
};

export const LONGUEUR_MAX_RELANCE = 4800;
export const NB_MAX_ENVOIS_GROUPES = 50;

export type EtatRelanceProspect = "A_RELANCER" | "RAPPEL_PREVU" | "RELANCE_RECENTE" | "JAMAIS_RELANCE";

export const ETAT_RELANCE: Record<EtatRelanceProspect, { libelle: string; variante: "danger" | "info" | "success" | "warning" }> = {
  A_RELANCER: { libelle: m("À relancer"), variante: "danger" },
  JAMAIS_RELANCE: { libelle: m("Jamais relancé"), variante: "warning" },
  RAPPEL_PREVU: { libelle: m("Rappel prévu"), variante: "info" },
  RELANCE_RECENTE: { libelle: m("Relancé récemment"), variante: "success" },
};

/**
 * État de relance d'un prospect, à l'heure de Douala.
 * - un rappel daté arrivé à échéance (ou dépassé) → À RELANCER, quoi qu'il y ait eu entre-temps ;
 * - un rappel daté dans le futur → RAPPEL PRÉVU ;
 * - sans rappel : jamais relancé → JAMAIS RELANCÉ ; dernière relance ≥ 7 jours → À RELANCER ; sinon RELANCÉ RÉCEMMENT.
 */
export function etatRelance(
  prospect: { rappelLe: string | null; derniereRelanceLe: Date | null },
  maintenant: Date = new Date()
): EtatRelanceProspect {
  const aujourdhui = aujourdhuiDouala(maintenant);
  if (prospect.rappelLe && estJourValide(prospect.rappelLe)) {
    return prospect.rappelLe <= aujourdhui ? "A_RELANCER" : "RAPPEL_PREVU";
  }
  if (!prospect.derniereRelanceLe) return "JAMAIS_RELANCE";
  const jours = ecartEnJours(aujourdhuiDouala(prospect.derniereRelanceLe), aujourdhui);
  return jours >= DELAI_RELANCE_JOURS ? "A_RELANCER" : "RELANCE_RECENTE";
}

/** « À relancer » au sens du filtre de l'écran : à relancer maintenant ou jamais relancé. */
export function estARelancer(etat: EtatRelanceProspect): boolean {
  return etat === "A_RELANCER" || etat === "JAMAIS_RELANCE";
}

export type ModeleRelance = { cle: string; libelle: string; objet: string; message: string; whatsapp: string };

/**
 * Textes proposés pour relancer un prospect. `{nom}` et `{entreprise}` sont remplacés à l'envoi. Ils restent modifiables à
 * l'écran : l'équipe adapte avant d'envoyer. Aucun élément entre crochets (« [à compléter] ») : le texte part tel quel.
 */
export const MODELES_RELANCE: ModeleRelance[] = [
  {
    cle: "prise-de-nouvelles",
    libelle: m("Prise de nouvelles"),
    objet: m("Suite à notre échange"),
    message: m("Bonjour {nom},\n\nJe reviens vers vous suite à notre échange. Avez-vous eu le temps d'y réfléchir ? Je reste à votre disposition pour répondre à toutes vos questions.\n\nCordialement,\n{entreprise}"),
    whatsapp: m("Bonjour {nom}, c'est {entreprise}. Je reviens vers vous suite à notre échange : avez-vous eu le temps d'y réfléchir ? Je reste à votre disposition."),
  },
  {
    cle: "rappel-demande",
    libelle: m("Rappel de votre demande"),
    objet: m("Votre demande chez {entreprise}"),
    message: m("Bonjour {nom},\n\nVous nous avez contactés récemment et nous souhaitons nous assurer que nous avons bien répondu à votre besoin. Pouvons-nous faire le point ensemble ?\n\nCordialement,\n{entreprise}"),
    whatsapp: m("Bonjour {nom}, c'est {entreprise}. Vous nous avez contactés récemment : pouvons-nous faire le point sur votre besoin ?"),
  },
  {
    cle: "proposition-rendez-vous",
    libelle: m("Proposer un rendez-vous"),
    objet: m("Un échange rapide ?"),
    message: m("Bonjour {nom},\n\nSeriez-vous disponible pour un court échange (appel ou rendez-vous) cette semaine afin de préciser votre projet ? Indiquez-moi le moment qui vous convient.\n\nCordialement,\n{entreprise}"),
    whatsapp: m("Bonjour {nom}, c'est {entreprise}. Seriez-vous disponible pour un court échange cette semaine ? Dites-moi quel moment vous convient."),
  },
  {
    cle: "derniere-relance",
    libelle: m("Dernière relance"),
    objet: m("Votre projet est-il toujours d'actualité ?"),
    message: m("Bonjour {nom},\n\nSans nouvelle de votre part, je me permets une dernière relance : votre projet est-il toujours d'actualité ? Si ce n'est plus le cas, dites-le-moi simplement, je ne vous solliciterai plus.\n\nCordialement,\n{entreprise}"),
    whatsapp: m("Bonjour {nom}, c'est {entreprise}. Votre projet est-il toujours d'actualité ? Si ce n'est plus le cas, dites-le-moi simplement."),
  },
];

/** Remplace `{nom}` et `{entreprise}` ; un texte sans ces repères reste inchangé. */
export function remplirModeleRelance(texte: string, valeurs: { nom: string; entreprise: string }): string {
  return texte.replaceAll("{nom}", valeurs.nom).replaceAll("{entreprise}", valeurs.entreprise);
}

/**
 * Lien qui ouvre la conversation WhatsApp du prospect avec le message déjà écrit (wa.me, sans passer par l'API WhatsApp
 * Business : c'est la personne qui appuie sur « Envoyer » dans son WhatsApp). Renvoie null pour un numéro inexploitable.
 */
export function lienWhatsApp(telephone: string | null | undefined, message: string): string | null {
  const international = telephoneInternational(telephone);
  if (!international) return null;
  return `https://wa.me/${international.slice(1)}?text=${encodeURIComponent(message)}`;
}
