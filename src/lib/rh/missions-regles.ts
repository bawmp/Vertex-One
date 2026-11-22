import { m } from "@/lib/i18n/catalogue";
import { ajouterJours, ecartEnJours, estJourValide } from "@/lib/facturation/promesse-regles";

/**
 * Missions : règles pures (sans accès base), utilisables dans le navigateur. Les jours sont des textes AAAA-MM-JJ lus à l'heure de Douala,
 * jamais des instants ; le serveur revérifie toujours ce que le navigateur a déjà contrôlé.
 */
export const HORIZONS = ["HEBDOMADAIRE", "MENSUELLE", "LONGUE_DUREE", "PERMANENTE"] as const;
export type HorizonMission = (typeof HORIZONS)[number];

export const LIBELLE_HORIZON: Record<HorizonMission, string> = {
  HEBDOMADAIRE: m("Hebdomadaire"),
  MENSUELLE: m("Mensuelle"),
  LONGUE_DUREE: m("Longue durée"),
  PERMANENTE: m("Permanente"),
};

/** Titre de section affiché sur la page des missions, dans l'ordre d'affichage. */
export const TITRE_SECTION_HORIZON: Record<HorizonMission, string> = {
  HEBDOMADAIRE: m("Missions de la semaine"),
  MENSUELLE: m("Missions du mois"),
  LONGUE_DUREE: m("Missions de longue durée"),
  PERMANENTE: m("Missions permanentes"),
};

/** CLOTUREE : période close par le renouvellement automatique (l'avancement atteint reste, c'est l'historique de la période). */
export type StatutMission = "EN_COURS" | "TERMINEE" | "ANNULEE" | "CLOTUREE";
export type EtatMission = "A_VENIR" | "EN_COURS" | "EN_RETARD" | "TERMINEE" | "ANNULEE" | "CLOTUREE";

export const ETAT_MISSION: Record<EtatMission, { libelle: string; variante: "info" | "success" | "warning" | "danger" | "neutral" }> = {
  A_VENIR: { libelle: m("À venir"), variante: "neutral" },
  EN_COURS: { libelle: m("En cours"), variante: "info" },
  EN_RETARD: { libelle: m("En retard"), variante: "danger" },
  TERMINEE: { libelle: m("Terminée"), variante: "success" },
  ANNULEE: { libelle: m("Annulée"), variante: "neutral" },
  CLOTUREE: { libelle: m("Période terminée"), variante: "neutral" },
};

/** Missions en cours ou à venir au plus par personne : au-delà, il faut en terminer ou en annuler avant d'en confier d'autres. */
export const MAX_MISSIONS_ACTIVES = 40;
/** Une mission de longue durée ne dépasse pas trois ans : au-delà, c'est une mission permanente. */
export const JOURS_MAX_LONGUE_DUREE = 1096;
/** On peut poser une mission commencée il y a au plus un mois (rattrapage) et qui démarre dans l'année au plus. */
export const JOURS_PASSE_MAX = 31;
export const JOURS_FUTUR_MAX = 366;
export const LONGUEUR_TITRE_MAX = 120;
export const LONGUEUR_TEXTE_MAX = 600;
export const LONGUEUR_RESULTAT_MAX = 300;

/** Même quantième le mois suivant (le 31 janvier donne le 28 ou 29 février : jamais un débordement sur le mois d'après). */
export function ajouterUnMois(jour: string): string {
  const [a, mo, j] = jour.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(a, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, mo, Math.min(j, dernierJour))).toISOString().slice(0, 10);
}

/**
 * Fin d'une mission selon son horizon : la semaine dure 7 jours à partir du début, le mois va jusqu'à la veille du même quantième du mois
 * suivant, une mission de longue durée garde la date saisie, une mission permanente n'en a pas.
 */
export function finDeMission(horizon: HorizonMission, dateDebut: string, dateFinSaisie: string | null): string | null {
  if (horizon === "HEBDOMADAIRE") return ajouterJours(dateDebut, 6);
  if (horizon === "MENSUELLE") return ajouterJours(ajouterUnMois(dateDebut), -1);
  if (horizon === "LONGUE_DUREE") return dateFinSaisie;
  return null;
}

export type SaisieMission = { titre: string; description: string; resultatAttendu: string; horizon: string; dateDebut: string; dateFin: string; reconduction?: string };
export type ValeursMission = { titre: string; description: string | null; resultatAttendu: string | null; horizon: HorizonMission; dateDebut: string; dateFin: string | null; reconduction: boolean };

/** Valide et nettoie la saisie ; les messages sont des clés françaises traduites par l'appelant. `aujourdhui` est un jour AAAA-MM-JJ de Douala. */
export function validerMission(s: SaisieMission, aujourdhui: string): { ok: true; valeurs: ValeursMission } | { ok: false; erreur: string } {
  const titre = s.titre.replace(/\s+/g, " ").trim();
  if (titre.length < 3) return { ok: false, erreur: m("Donnez un titre d'au moins 3 caractères à la mission.") };
  if (titre.length > LONGUEUR_TITRE_MAX) return { ok: false, erreur: m("Le titre est limité à 120 caractères.") };
  const description = s.description.trim();
  if (description.length > LONGUEUR_TEXTE_MAX) return { ok: false, erreur: m("La description est limitée à 600 caractères.") };
  const resultatAttendu = s.resultatAttendu.trim();
  if (resultatAttendu.length > LONGUEUR_RESULTAT_MAX) return { ok: false, erreur: m("Le résultat attendu est limité à 300 caractères.") };
  if (!(HORIZONS as readonly string[]).includes(s.horizon)) return { ok: false, erreur: m("Durée de mission inconnue.") };
  const horizon = s.horizon as HorizonMission;

  if (!estJourValide(s.dateDebut)) return { ok: false, erreur: m("Date de début invalide.") };
  if (s.dateDebut < ajouterJours(aujourdhui, -JOURS_PASSE_MAX)) return { ok: false, erreur: m("La mission ne peut pas avoir commencé il y a plus d'un mois.") };
  if (s.dateDebut > ajouterJours(aujourdhui, JOURS_FUTUR_MAX)) return { ok: false, erreur: m("La mission ne peut pas démarrer dans plus d'un an.") };

  let dateFinSaisie: string | null = null;
  if (horizon === "LONGUE_DUREE") {
    if (!estJourValide(s.dateFin)) return { ok: false, erreur: m("Indiquez la date de fin de la mission.") };
    if (s.dateFin < s.dateDebut) return { ok: false, erreur: m("La date de fin ne peut pas précéder la date de début.") };
    if (ecartEnJours(s.dateDebut, s.dateFin) > JOURS_MAX_LONGUE_DUREE) return { ok: false, erreur: m("Une mission de longue durée ne dépasse pas trois ans : au-delà, rendez-la permanente.") };
    dateFinSaisie = s.dateFin;
  }

  // Le renouvellement n'existe que pour une mission de la semaine ou du mois ; coché sur une autre durée, il est ignoré.
  const reconduction = peutSeRenouveler(horizon) && ["on", "true", "1"].includes(String(s.reconduction ?? "").toLowerCase());
  return { ok: true, valeurs: { titre, description: description || null, resultatAttendu: resultatAttendu || null, horizon, dateDebut: s.dateDebut, dateFin: finDeMission(horizon, s.dateDebut, dateFinSaisie), reconduction } };
}

/** Avancement (entier de 0 à 100) et point de suivi de la personne. */
export function validerSuivi(avancementBrut: unknown, noteBrute: string): { ok: true; avancement: number; note: string | null } | { ok: false; erreur: string } {
  const avancement = typeof avancementBrut === "number" ? avancementBrut : Number(String(avancementBrut ?? "").trim());
  if (!Number.isInteger(avancement) || avancement < 0 || avancement > 100) return { ok: false, erreur: m("L'avancement est un nombre entier entre 0 et 100.") };
  const note = noteBrute.trim();
  if (note.length > LONGUEUR_TEXTE_MAX) return { ok: false, erreur: m("Le point de suivi est limité à 600 caractères.") };
  return { ok: true, avancement, note: note || null };
}

/** État affiché : l'état enregistré, affiné par les dates (pas encore commencée, ou échéance dépassée sans être terminée). */
export function etatMission(mission: { statut: string; dateDebut: string; dateFin: string | null }, aujourdhui: string): EtatMission {
  if (mission.statut === "TERMINEE") return "TERMINEE";
  if (mission.statut === "ANNULEE") return "ANNULEE";
  if (mission.statut === "CLOTUREE") return "CLOTUREE";
  if (mission.dateDebut > aujourdhui) return "A_VENIR";
  if (mission.dateFin && mission.dateFin < aujourdhui) return "EN_RETARD";
  return "EN_COURS";
}

/** Jours restants jusqu'à la fin (0 le dernier jour, négatif si dépassée) ; null pour une mission sans fin. */
export function joursRestants(dateFin: string | null, aujourdhui: string): number | null {
  return dateFin ? ecartEnJours(aujourdhui, dateFin) : null;
}

/** Une mission permanente n'a pas de pourcentage : elle se suit par des points de suivi. */
export function aUnAvancement(horizon: string): boolean {
  return horizon !== "PERMANENTE";
}

/** Seules les missions de la semaine et du mois se renouvellent : une longue durée a sa propre fin, une permanente n'en a pas. */
export function peutSeRenouveler(horizon: string): boolean {
  return horizon === "HEBDOMADAIRE" || horizon === "MENSUELLE";
}

/** Nombre maximal de périodes sautées d'un coup si le worker est resté arrêté longtemps (garde-fou, jamais atteint en pratique). */
const SAUTS_MAX = 120;

/**
 * Période qui suit une mission renouvelable : elle commence le lendemain de la fin de la précédente. Si le worker est resté arrêté et que cette
 * période est déjà passée, on saute jusqu'à celle qui contient aujourd'hui (on ne recrée jamais des semaines mortes). Null si l'horizon ne se
 * renouvelle pas ou si la mission n'a pas de fin.
 */
export function prochainePeriode(horizon: string, dateFin: string | null, aujourdhui: string): { dateDebut: string; dateFin: string } | null {
  if (!peutSeRenouveler(horizon) || !dateFin) return null;
  let debut = ajouterJours(dateFin, 1);
  for (let i = 0; i < SAUTS_MAX; i++) {
    const fin = finDeMission(horizon as HorizonMission, debut, null);
    if (!fin) return null;
    if (fin >= aujourdhui) return { dateDebut: debut, dateFin: fin };
    debut = ajouterJours(fin, 1);
  }
  return null;
}
