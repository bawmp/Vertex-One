import { m } from "@/lib/i18n/catalogue";

/**
 * Règles pures de la promesse de paiement (sans accès à la base : utilisables aussi dans le navigateur, qui y vérifie la date
 * saisie avant de l'envoyer — le serveur, lui, la revérifie toujours). Les dates de promesse sont des JOURS (AAAA-MM-JJ) lus à
 * l'heure de Douala, jamais des instants : « le 4 novembre » ne dépend pas du fuseau de celui qui regarde.
 */

/** Façons dont une promesse est recueillie par l'équipe (la valeur « client » est réservée à la page publique de la facture). */
export const CANAUX_PROMESSE = ["appel", "whatsapp", "rendez-vous", "autre"] as const;
export type CanalPromesse = (typeof CANAUX_PROMESSE)[number];

export const LIBELLES_CANAL_PROMESSE: Record<string, string> = {
  appel: m("Appel téléphonique"),
  whatsapp: m("WhatsApp"),
  "rendez-vous": m("Rendez-vous"),
  autre: m("Autre"),
  client: m("Déclarée par le client"),
};

/** Une promesse ne peut pas viser plus loin que ce nombre de jours : au-delà, ce n'est plus une promesse de paiement. */
export const JOURS_MAX_PROMESSE = 60;

/** Jours de grâce après la date promise avant de la déclarer non tenue (le client peut payer en fin de journée, ou le lendemain). */
export const JOURS_DE_GRACE = 1;

export const LONGUEUR_MAX_NOTE_PROMESSE = 500;

export type StatutPromesse = "EN_COURS" | "TENUE" | "NON_TENUE" | "ANNULEE";

export const STATUT_PROMESSE: Record<StatutPromesse, { libelle: string; variante: "info" | "success" | "danger" | "neutral" }> = {
  EN_COURS: { libelle: m("Promesse en cours"), variante: "info" },
  TENUE: { libelle: m("Promesse tenue"), variante: "success" },
  NON_TENUE: { libelle: m("Promesse non tenue"), variante: "danger" },
  ANNULEE: { libelle: m("Remplacée ou annulée"), variante: "neutral" },
};

const FORMAT_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Le jour d'aujourd'hui à Douala, au format AAAA-MM-JJ. */
export function aujourdhuiDouala(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Douala" }).format(maintenant);
}

/** Jour valide (calendrier réel, pas « 2026-02-31 ») au format AAAA-MM-JJ ? */
export function estJourValide(jour: unknown): jour is string {
  if (typeof jour !== "string") return false;
  const trouve = FORMAT_JOUR.exec(jour);
  if (!trouve) return false;
  const [, a, mo, j] = trouve;
  const d = new Date(Date.UTC(Number(a), Number(mo) - 1, Number(j)));
  return d.getUTCFullYear() === Number(a) && d.getUTCMonth() === Number(mo) - 1 && d.getUTCDate() === Number(j);
}

/** Ajoute (ou retire) des jours à un jour AAAA-MM-JJ. */
export function ajouterJours(jour: string, nombre: number): string {
  const [a, mo, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, mo - 1, j + nombre));
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre deux jours AAAA-MM-JJ (positif si `cible` est après `depuis`). */
export function ecartEnJours(depuis: string, cible: string): number {
  const [a1, m1, j1] = depuis.split("-").map(Number);
  const [a2, m2, j2] = cible.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000);
}

/**
 * Vérifie la date d'une promesse : un jour réel, pas avant `jourMin` (aujourd'hui pour l'équipe, demain pour le client qui
 * déclare lui-même), pas au-delà de JOURS_MAX_PROMESSE jours. Renvoie un message d'erreur (clé française) ou null.
 */
export function verifierDatePromesse(datePromise: unknown, aujourdhui: string, jourMin: string = aujourdhui): string | null {
  if (!estJourValide(datePromise)) return m("Date invalide.");
  if (datePromise < jourMin) return jourMin === aujourdhui ? m("La date promise ne peut pas être dans le passé.") : m("Choisissez une date à partir de demain.");
  if (datePromise > ajouterJours(aujourdhui, JOURS_MAX_PROMESSE)) return m("La date promise est trop lointaine (60 jours au plus).");
  return null;
}

/** La date promise (plus le jour de grâce) est-elle dépassée ? */
export function promesseEchue(datePromise: string, aujourdhui: string): boolean {
  return ajouterJours(datePromise, JOURS_DE_GRACE) < aujourdhui;
}

/**
 * Une promesse est TENUE dès que la facture est soldée, ou que les règlements enregistrés depuis la promesse couvrent le
 * montant promis. Sinon elle court encore (ou échoit, voir promesseEchue).
 */
export function promesseTenue(params: { montantPromis: number; solde: number; payeDepuis: number }): boolean {
  return params.solde <= 0 || params.payeDepuis >= params.montantPromis;
}

/** Montant d'une promesse : le solde restant par défaut, jamais plus que ce qui reste dû, entier strictement positif. */
export function determinerMontantPromesse(solde: number, demande: unknown): { montant: number } | { erreur: string } {
  if (solde <= 0) return { erreur: m("Cette facture n'a plus de solde à régler.") };
  if (demande === undefined || demande === null || demande === "") return { montant: solde };
  const montant = typeof demande === "string" ? Number(demande) : demande;
  if (typeof montant !== "number" || !Number.isInteger(montant) || montant <= 0) return { erreur: m("Montant invalide.") };
  if (montant > solde) return { erreur: m("Le montant promis dépasse le solde restant à payer.") };
  return { montant };
}

export function noteNettoyee(brute: unknown): string | null {
  if (typeof brute !== "string") return null;
  const note = brute.trim().slice(0, LONGUEUR_MAX_NOTE_PROMESSE);
  return note || null;
}

/** Jour AAAA-MM-JJ lisible dans la langue de l'interface (« 4 novembre 2026 » / « 4 nov. 2026 »). */
export function formaterJourPromesse(jour: string, locale: string, style: "long" | "medium" = "long"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }).format(new Date(`${jour}T00:00:00Z`));
}
