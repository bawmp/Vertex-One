import { and, asc, count, desc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, mission, utilisateur } from "@/db/schema";
import { m } from "@/lib/i18n/catalogue";
import { disponible } from "@/lib/plans";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { peutGererTachesPoste } from "./taches-poste";
import { gabaritMissionConfiee, gabaritMissionsRenouvelees } from "./missions-email";
import { aUnAvancement, MAX_MISSIONS_ACTIVES, peutSeRenouveler, prochainePeriode, validerMission, validerSuivi, type HorizonMission, type SaisieMission, type StatutMission } from "./missions-regles";

/**
 * Missions (accès base). Qui voit : la personne, son manager (portée RH) et l'Administrateur. Qui pose, annule, rouvre, supprime : l'Administrateur,
 * ou le Manager qui a le droit de modifier la RH ET dont la portée RH contient la personne — jamais la personne elle-même (on ne se confie pas ses
 * propres missions). Qui suit (avancement, point de suivi, terminer) : la personne et ceux qui la gèrent. Tout est relu en base avec l'entreprise
 * de la session : aucun identifiant du navigateur n'est cru.
 */

type Resultat = { ok: true } | { ok: false; erreur: string };
/** Email à envoyer APRÈS la transaction (jamais bloquant) : null si la personne s'est confié la mission à elle-même ou n'a pas d'adresse. */
export type EmailMission = { to: string; sujet: string; html: string };

export type MissionLue = {
  id: string;
  utilisateurId: string;
  nomPersonne: string;
  titre: string;
  description: string | null;
  resultatAttendu: string | null;
  horizon: HorizonMission;
  dateDebut: string;
  dateFin: string | null;
  statut: StatutMission;
  avancement: number;
  noteSuivi: string | null;
  suiviLe: Date | null;
  creeLe: Date;
  termineeLe: Date | null;
  reconduction: boolean;
};

/** Même règle que les tâches du poste : Administrateur, ou Manager (droit RH/MODIFIER) dont la portée contient la personne, jamais elle-même. */
export const peutGererMissions = peutGererTachesPoste;

async function porteeRH(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<"TOUT" | string[]> {
  return u.role === "ADMIN" ? "TOUT" : idsVisibles(tx, u, "RH");
}

/** Le forfait de l'entreprise donne-t-il accès aux Ressources Humaines (abonnement non suspendu) ? */
export async function ressourcesHumainesDisponibles(tx: TransactionDrizzle, entrepriseId: string): Promise<boolean> {
  const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return Boolean(e) && disponible(e, "RH");
}

/** Missions que l'utilisateur a le droit de voir (les siennes, celles de sa portée RH), éventuellement limitées à une personne. Plus récentes d'abord. */
export async function lireMissions(tx: TransactionDrizzle, u: UtilisateurConnecte, filtre: { utilisateurId?: string } = {}): Promise<MissionLue[]> {
  if (!peut(u, "RH", "VOIR")) return [];
  const ids = await porteeRH(tx, u);
  const conditions = [eq(mission.entrepriseId, u.entrepriseId), eq(utilisateur.entrepriseId, u.entrepriseId)];
  if (ids !== "TOUT") conditions.push(inArray(mission.utilisateurId, ids));
  if (filtre.utilisateurId) conditions.push(eq(mission.utilisateurId, filtre.utilisateurId));
  const lignes = await tx
    .select({
      id: mission.id,
      utilisateurId: mission.utilisateurId,
      nomPersonne: utilisateur.nomComplet,
      titre: mission.titre,
      description: mission.description,
      resultatAttendu: mission.resultatAttendu,
      horizon: mission.horizon,
      dateDebut: mission.dateDebut,
      dateFin: mission.dateFin,
      statut: mission.statut,
      avancement: mission.avancement,
      noteSuivi: mission.noteSuivi,
      suiviLe: mission.suiviLe,
      creeLe: mission.creeLe,
      termineeLe: mission.termineeLe,
      reconduction: mission.reconduction,
    })
    .from(mission)
    .innerJoin(utilisateur, eq(mission.utilisateurId, utilisateur.id))
    .where(and(...conditions))
    .orderBy(desc(mission.creeLe));
  return lignes.map((l) => ({ ...l, horizon: l.horizon as HorizonMission, statut: l.statut as StatutMission }));
}

/** Personnes à qui l'utilisateur peut confier une mission : toute l'entreprise pour l'Administrateur, son équipe (sans lui) pour un Manager, personne pour un Employé. */
export async function personnesAssignables(tx: TransactionDrizzle, u: UtilisateurConnecte): Promise<{ id: string; nom: string }[]> {
  if (u.role !== "ADMIN" && !(u.role === "MANAGER" && peut(u, "RH", "MODIFIER"))) return [];
  const ids = await porteeRH(tx, u);
  const conditions = [eq(utilisateur.entrepriseId, u.entrepriseId), eq(utilisateur.statut, "ACTIF"), notInArray(utilisateur.role, ["CLIENT", "COMPTABLE"])];
  if (ids !== "TOUT") conditions.push(inArray(utilisateur.id, ids), ne(utilisateur.id, u.utilisateurId));
  const lignes = await tx.select({ id: utilisateur.id, nom: utilisateur.nomComplet }).from(utilisateur).where(and(...conditions)).orderBy(asc(utilisateur.nomComplet));
  return lignes;
}

/** Cible relue en base : même entreprise, compte actif, ni client du portail ni comptable externe (`utilisateur` est en RLS permissive, le filtre est explicite). */
async function cibleDeLEntreprise(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<boolean> {
  const [c] = await tx
    .select({ id: utilisateur.id })
    .from(utilisateur)
    .where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT"), ne(utilisateur.role, "COMPTABLE")));
  return Boolean(c);
}

async function missionsActives(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<number> {
  const [{ n }] = await tx.select({ n: count() }).from(mission).where(and(eq(mission.entrepriseId, entrepriseId), eq(mission.utilisateurId, utilisateurId), eq(mission.statut, "EN_COURS")));
  return n;
}

export async function creerMission(tx: TransactionDrizzle, u: UtilisateurConnecte, cibleId: string, saisie: SaisieMission, aujourdhui: string = aujourdhuiDouala()): Promise<{ ok: true; email: EmailMission | null } | { ok: false; erreur: string }> {
  const v = validerMission(saisie, aujourdhui);
  if (!v.ok) return v;
  if (!(await cibleDeLEntreprise(tx, u.entrepriseId, cibleId))) return { ok: false, erreur: m("Collaborateur introuvable.") };
  if (!peutGererMissions(u, cibleId, await porteeRH(tx, u))) return { ok: false, erreur: m("Vous n'avez pas le droit de confier une mission à cette personne.") };
  if ((await missionsActives(tx, u.entrepriseId, cibleId)) >= MAX_MISSIONS_ACTIVES) return { ok: false, erreur: m("Quarante missions en cours au plus par personne : terminez ou annulez-en avant d'en confier d'autres.") };
  await tx.insert(mission).values({ entrepriseId: u.entrepriseId, utilisateurId: cibleId, ...v.valeurs, creeParId: u.utilisateurId });

  // Email de la personne : relu en base (jamais une adresse venue du navigateur), préparé ici et envoyé par l'appelant après la transaction.
  if (cibleId === u.utilisateurId) return { ok: true, email: null };
  const [[cible], [auteur], [ent]] = await Promise.all([
    tx.select({ email: utilisateur.email, nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, cibleId), eq(utilisateur.entrepriseId, u.entrepriseId))),
    tx.select({ nom: utilisateur.nomComplet }).from(utilisateur).where(and(eq(utilisateur.id, u.utilisateurId), eq(utilisateur.entrepriseId, u.entrepriseId))),
    tx.select({ nom: entreprise.nom }).from(entreprise).where(eq(entreprise.id, u.entrepriseId)),
  ]);
  if (!cible?.email) return { ok: true, email: null };
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const { sujet, html } = gabaritMissionConfiee({ nomPersonne: cible.nom, confieePar: auteur?.nom ?? "Votre responsable", entreprise: ent?.nom ?? "votre entreprise", mission: v.valeurs, lien: `${base}/app/rh/missions` });
  return { ok: true, email: { to: cible.email, sujet, html } };
}

async function lireUne(tx: TransactionDrizzle, entrepriseId: string, id: string) {
  const [l] = await tx.select().from(mission).where(and(eq(mission.id, id), eq(mission.entrepriseId, entrepriseId)));
  return l ?? null;
}

/**
 * Point d'avancement : la personne (ou celui qui la gère) renseigne l'avancement et un point de suivi, ou termine la mission. Une mission permanente
 * n'a pas de pourcentage et ne se termine pas (on l'annule quand elle n'a plus lieu d'être).
 */
export async function suivreMission(tx: TransactionDrizzle, u: UtilisateurConnecte, missionId: string, suivi: { avancement: unknown; note: string; terminer: boolean }): Promise<Resultat> {
  const l = await lireUne(tx, u.entrepriseId, missionId);
  if (!l) return { ok: false, erreur: m("Mission introuvable.") };
  const proprietaire = l.utilisateurId === u.utilisateurId;
  if (!proprietaire && !peutGererMissions(u, l.utilisateurId, await porteeRH(tx, u))) return { ok: false, erreur: m("Vous n'avez pas le droit de suivre cette mission.") };
  if (l.statut !== "EN_COURS") return { ok: false, erreur: m("Cette mission n'est plus en cours.") };

  const avecAvancement = aUnAvancement(l.horizon);
  const v = validerSuivi(avecAvancement ? suivi.avancement : 0, suivi.note);
  if (!v.ok) return v;
  if (suivi.terminer && !avecAvancement) return { ok: false, erreur: m("Une mission permanente ne se termine pas : annulez-la si elle n'a plus lieu d'être.") };

  await tx
    .update(mission)
    .set({
      avancement: suivi.terminer ? 100 : avecAvancement ? v.avancement : 0,
      noteSuivi: v.note,
      suiviLe: sql`now()`,
      ...(suivi.terminer ? { statut: "TERMINEE", termineeLe: sql`now()` } : {}),
    })
    .where(and(eq(mission.id, missionId), eq(mission.entrepriseId, u.entrepriseId)));
  return { ok: true };
}

/** Annuler, rouvrir ou supprimer : réservé à qui gère la personne. L'annulation garde la trace ; la suppression l'efface (mission posée par erreur). */
export async function gererMission(tx: TransactionDrizzle, u: UtilisateurConnecte, missionId: string, action: "ANNULER" | "ROUVRIR" | "SUPPRIMER"): Promise<Resultat> {
  const l = await lireUne(tx, u.entrepriseId, missionId);
  if (!l) return { ok: false, erreur: m("Mission introuvable.") };
  if (!peutGererMissions(u, l.utilisateurId, await porteeRH(tx, u))) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier cette mission.") };
  const filtre = and(eq(mission.id, missionId), eq(mission.entrepriseId, u.entrepriseId));

  if (action === "SUPPRIMER") {
    await tx.delete(mission).where(filtre);
  } else if (action === "ANNULER") {
    if (l.statut !== "EN_COURS") return { ok: false, erreur: m("Cette mission n'est plus en cours.") };
    await tx.update(mission).set({ statut: "ANNULEE" }).where(filtre);
  } else {
    if (l.statut === "EN_COURS") return { ok: true };
    if ((await missionsActives(tx, u.entrepriseId, l.utilisateurId)) >= MAX_MISSIONS_ACTIVES) return { ok: false, erreur: m("Quarante missions en cours au plus par personne : terminez ou annulez-en avant d'en confier d'autres.") };
    await tx.update(mission).set({ statut: "EN_COURS", termineeLe: null }).where(filtre);
  }
  return { ok: true };
}

/**
 * Active ou coupe le renouvellement automatique d'une mission de la semaine ou du mois : réservé à qui gère la personne. Une mission annulée ne
 * se renouvelle jamais (annuler une mission arrête donc la série).
 */
export async function definirReconduction(tx: TransactionDrizzle, u: UtilisateurConnecte, missionId: string, actif: boolean): Promise<Resultat> {
  const l = await lireUne(tx, u.entrepriseId, missionId);
  if (!l) return { ok: false, erreur: m("Mission introuvable.") };
  if (!peutGererMissions(u, l.utilisateurId, await porteeRH(tx, u))) return { ok: false, erreur: m("Vous n'avez pas le droit de modifier cette mission.") };
  if (!peutSeRenouveler(l.horizon)) return { ok: false, erreur: m("Seules les missions de la semaine et du mois peuvent se renouveler.") };
  if (l.statut === "ANNULEE") return { ok: false, erreur: m("Une mission annulée ne se renouvelle pas.") };
  await tx.update(mission).set({ reconduction: actif === true }).where(and(eq(mission.id, missionId), eq(mission.entrepriseId, u.entrepriseId)));
  return { ok: true };
}

/**
 * Renouvelle les missions dont la période est finie (appelé chaque nuit par le worker, une entreprise à la fois, dans sa transaction RLS).
 * Pour chaque mission `reconduction` dont la fin est passée, jamais annulée, de quelqu'un d'encore actif : elle est CLOTUREE si elle était en cours
 * (l'avancement atteint reste, c'est l'historique de la période), et la suivante est créée — même texte, même personne, même auteur, avancement à zéro.
 * Idempotent : la mission est « réservée » (`suivante_creee_le`) AVANT la création, donc deux passages simultanés ne créent jamais deux suites.
 * Renvoie un email par personne, regroupant ses missions renouvelées.
 */
export async function renouvelerMissions(tx: TransactionDrizzle, entrepriseId: string, aujourdhui: string): Promise<{ renouvelees: number; courriers: { to: string; sujet: string; html: string }[] }> {
  const echues = await tx
    .select({ m: mission, nom: utilisateur.nomComplet, email: utilisateur.email })
    .from(mission)
    .innerJoin(utilisateur, eq(mission.utilisateurId, utilisateur.id))
    .where(and(eq(mission.entrepriseId, entrepriseId), eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), eq(mission.reconduction, true), isNull(mission.suivanteCreeeLe), ne(mission.statut, "ANNULEE"), lt(mission.dateFin, aujourdhui)));

  const parPersonne = new Map<string, { nom: string; email: string; missions: { titre: string; resultatAttendu: string | null; dateDebut: string; dateFin: string }[] }>();
  let renouvelees = 0;
  for (const { m: ancienne, nom, email } of echues) {
    const periode = prochainePeriode(ancienne.horizon, ancienne.dateFin, aujourdhui);
    if (!periode) continue;
    // Réservation d'abord : seul le passage qui la prend crée la suivante.
    const reservee = await tx
      .update(mission)
      .set({ suivanteCreeeLe: sql`now()`, statut: ancienne.statut === "EN_COURS" ? "CLOTUREE" : ancienne.statut })
      .where(and(eq(mission.id, ancienne.id), eq(mission.entrepriseId, entrepriseId), isNull(mission.suivanteCreeeLe)))
      .returning({ id: mission.id });
    if (reservee.length === 0) continue;
    await tx.insert(mission).values({
      entrepriseId,
      utilisateurId: ancienne.utilisateurId,
      titre: ancienne.titre,
      description: ancienne.description,
      resultatAttendu: ancienne.resultatAttendu,
      horizon: ancienne.horizon,
      dateDebut: periode.dateDebut,
      dateFin: periode.dateFin,
      creeParId: ancienne.creeParId,
      reconduction: true,
      precedenteId: ancienne.id,
    });
    renouvelees++;
    const p = parPersonne.get(ancienne.utilisateurId) ?? { nom, email, missions: [] };
    p.missions.push({ titre: ancienne.titre, resultatAttendu: ancienne.resultatAttendu, dateDebut: periode.dateDebut, dateFin: periode.dateFin });
    parPersonne.set(ancienne.utilisateurId, p);
  }

  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const courriers = [...parPersonne.values()]
    .filter((p) => p.email)
    .map((p) => {
      const { sujet, html } = gabaritMissionsRenouvelees({ nomPersonne: p.nom, missions: p.missions, lien: `${base}/app/rh/missions` });
      return { to: p.email, sujet, html };
    });
  return { renouvelees, courriers };
}
