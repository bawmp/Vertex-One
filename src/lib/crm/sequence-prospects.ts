import { m } from "@/lib/i18n/catalogue";
import { aujourdhuiDouala, ajouterJours, ecartEnJours } from "@/lib/facturation/promesse-regles";

/**
 * Relance automatique des prospects qualifiés (2026-11-19) — règles pures (aucun accès à la base) : elles servent à l'exécuteur planifié, à l'aperçu
 * des réglages, aux écrans ET aux tests.
 *
 * Principe : après la qualification, un e-mail modèle part tout seul à J+3, puis J+7, puis J+14 (réglable), jusqu'à ce que la séquence s'arrête :
 * le prospect a répondu, devient client, est disqualifié, n'a plus d'adresse, ou l'équipe l'arrête. DÉSACTIVÉE par défaut ; plafonnée par jour.
 */

export const DELAIS_PAR_DEFAUT = [3, 7, 14];
export const NB_MAX_ETAPES = 3;
export const DELAI_MAX_JOURS = 90;
export const PLAFOND_PAR_DEFAUT = 30;
export const PLAFOND_MAX = 200;
/** Une relance manuelle (n'importe quel canal) récente retarde l'e-mail automatique : jamais deux messages à quelques heures d'écart. */
export const ECART_MIN_APRES_RELANCE_JOURS = 2;

/** Les modèles de la séquence, dans l'ordre : l'étape 1 est la prise de nouvelles, la dernière étape (3) est la « dernière relance ». */
export const MODELES_SEQUENCE = ["prise-de-nouvelles", "rappel-demande", "derniere-relance"] as const;

export type MotifArret = "a_repondu" | "manuel";

/** Ligne ajoutée au bas de chaque e-mail automatique : le prospect sait pourquoi il le reçoit et comment s'en défaire (sa réponse arrive à l'équipe). */
export const PIED_EMAIL_AUTOMATIQUE = m("Vous recevez ce message parce que vous avez manifesté de l'intérêt pour nos services. Pour ne plus recevoir nos relances, répondez simplement « stop » à cet e-mail.");

/**
 * Délais saisis (« 3, 7, 14 ») → liste d'entiers strictement croissants, de 1 à 3 valeurs, chacune de 1 à 90 jours. `null` si le texte est invalide :
 * jamais une séquence « devinée ».
 */
export function lireDelais(texte: string | null | undefined): number[] | null {
  const morceaux = String(texte ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (morceaux.length < 1 || morceaux.length > NB_MAX_ETAPES) return null;
  const delais: number[] = [];
  for (const morceau of morceaux) {
    if (!/^\d{1,3}$/.test(morceau)) return null;
    const n = Number(morceau);
    if (n < 1 || n > DELAI_MAX_JOURS) return null;
    if (delais.length > 0 && n <= delais[delais.length - 1]) return null;
    delais.push(n);
  }
  return delais;
}

export function ecrireDelais(delais: number[]): string {
  return delais.join(",");
}

/** Modèle de l'étape `etape` (0 = premier e-mail) pour une séquence de `nbEtapes` étapes : la dernière étape est toujours la « dernière relance » si la séquence en compte 3. */
export function modeleDeLEtape(etape: number): (typeof MODELES_SEQUENCE)[number] {
  return MODELES_SEQUENCE[Math.min(Math.max(etape, 0), MODELES_SEQUENCE.length - 1)];
}

export type ProspectSequence = {
  statut: string;
  convertiLe: Date | null;
  email: string | null;
  qualifieLe: Date | null;
  creeLe: Date;
  sequenceEtape: number;
  sequenceDerniereLe: Date | null;
  sequenceArreteeLe: Date | null;
  /** Date de la relance la plus récente, tous canaux confondus (manuelles et automatiques). */
  derniereRelanceLe: Date | null;
};

export type DecisionSequence =
  | { action: "ENVOYER"; etape: number; modele: (typeof MODELES_SEQUENCE)[number] }
  | { action: "ATTENDRE"; jour: string; etape: number }
  | { action: "TERMINEE" }
  | { action: "ARRETEE"; motif: "arret" }
  | { action: "SANS_EMAIL" }
  | { action: "NON_CONCERNE" };

/** Jour (AAAA-MM-JJ) où l'e-mail de l'étape `etape` devient dû : depuis la qualification pour le premier, depuis le dernier envoi automatique pour les suivants. */
export function jourPrevuEtape(p: Pick<ProspectSequence, "qualifieLe" | "creeLe" | "sequenceDerniereLe">, etape: number, delais: number[]): string {
  const ecart = etape === 0 ? delais[0] : delais[etape] - delais[etape - 1];
  const base = etape === 0 || !p.sequenceDerniereLe ? aujourdhuiDouala(p.qualifieLe ?? p.creeLe) : aujourdhuiDouala(p.sequenceDerniereLe);
  return ajouterJours(base, ecart);
}

/**
 * Que faire de ce prospect aujourd'hui ? Un seul e-mail à la fois : l'étape suivante est due `ecart` jours après le précédent envoi (ou après la
 * qualification), et jamais moins de 2 jours après une relance faite à la main. Rien pour un lead non qualifié, déjà client, sans adresse ou arrêté.
 */
export function decider(p: ProspectSequence, delais: number[], maintenant: Date = new Date()): DecisionSequence {
  if (p.statut !== "QUALIFIE" || p.convertiLe) return { action: "NON_CONCERNE" };
  if (p.sequenceArreteeLe) return { action: "ARRETEE", motif: "arret" };
  if (p.sequenceEtape >= delais.length) return { action: "TERMINEE" };
  if (!p.email) return { action: "SANS_EMAIL" };

  const aujourdhui = aujourdhuiDouala(maintenant);
  let jour = jourPrevuEtape(p, p.sequenceEtape, delais);
  if (p.derniereRelanceLe) {
    const apresRelance = ajouterJours(aujourdhuiDouala(p.derniereRelanceLe), ECART_MIN_APRES_RELANCE_JOURS);
    if (apresRelance > jour) jour = apresRelance;
  }
  if (jour > aujourdhui) return { action: "ATTENDRE", jour, etape: p.sequenceEtape };
  return { action: "ENVOYER", etape: p.sequenceEtape, modele: modeleDeLEtape(p.sequenceEtape) };
}

/** Retard éventuel (en jours) d'un envoi dû : sert à signaler un arriéré (séquence activée sur d'anciens prospects). */
export function joursDeRetard(jourPrevu: string, maintenant: Date = new Date()): number {
  return Math.max(0, ecartEnJours(jourPrevu, aujourdhuiDouala(maintenant)));
}

/** Où en est la séquence d'UN prospect, sous une forme simple à afficher (texte et dates seulement : rien d'autre ne traverse vers le navigateur). */
export type InfoAuto = {
  action: DecisionSequence["action"];
  /** Jour (AAAA-MM-JJ) du prochain e-mail automatique (« ATTENDRE » ou « ENVOYER »). */
  jour: string | null;
  /** Numéro de l'étape à venir (1 = premier e-mail) ou nombre d'e-mails déjà envoyés si terminée. */
  etape: number;
  nbEtapes: number;
  motif: MotifArret | null;
};

export function infoAuto(p: ProspectSequence & { sequenceArretMotif: string | null }, delais: number[], maintenant: Date = new Date()): InfoAuto {
  const d = decider(p, delais, maintenant);
  const motif: MotifArret | null = p.sequenceArretMotif === "a_repondu" ? "a_repondu" : p.sequenceArretMotif === "manuel" ? "manuel" : null;
  const base = { nbEtapes: delais.length, motif };
  if (d.action === "ENVOYER") return { ...base, action: d.action, jour: jourPrevuEtape(p, d.etape, delais), etape: d.etape + 1 };
  if (d.action === "ATTENDRE") return { ...base, action: d.action, jour: d.jour, etape: d.etape + 1 };
  return { ...base, action: d.action, jour: null, etape: p.sequenceEtape };
}
