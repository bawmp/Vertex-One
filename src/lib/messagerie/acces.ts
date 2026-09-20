import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { canal, entreprise, lectureCanal, membreCanal, messageCanal, reactionMessage, utilisateur } from "@/db/schema";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { projetsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";
import { idExterneCanal } from "@/lib/chat/client";
import { echapperMotifRecherche } from "@/lib/messagerie/mentions";

export type CanalLigne = typeof canal.$inferSelect;

export type PieceJointeAffichee = { nom: string; type: string; taille: number; image: boolean };
export type ReactionAffichee = { emoji: string; total: number; moi: boolean };

export type MessageAffiche = {
  id: string;
  auteurId: string;
  auteurNom: string;
  /** null quand le message a été supprimé : le fil est conservé, pas le texte. */
  contenu: string | null;
  supprime: boolean;
  /** Pièce jointe éventuelle (jamais présente sur un message supprimé). */
  piece: PieceJointeAffichee | null;
  /** Message auquel celui-ci répond (fil de discussion), null pour un message de la chronologie. */
  parentId: string | null;
  /** Nombre de réponses dans le fil de ce message (hors réponses supprimées). */
  nbReponses: number;
  reactions: ReactionAffichee[];
  creeLe: string;
  misAJourLe: string;
};

export const LONGUEUR_MAX_MESSAGE = 4000;
/** Un collègue est « en ligne » s'il a interrogé la messagerie il y a moins de 2 minutes. */
export const DELAI_EN_LIGNE_SECONDES = 120;

/** Canaux réservés à leurs membres : messages directs et groupes privés. */
export const TYPES_CANAL_PRIVES = ["DIRECT", "PRIVE"] as const;
export const estCanalPrive = (type: string) => (TYPES_CANAL_PRIVES as readonly string[]).includes(type);

/**
 * La messagerie est-elle utilisable par cet utilisateur ? Droit VOIR sur MESSAGERIE (matrice + accès
 * par module choisi par l'Administrateur) et forfait qui inclut le chat. Toujours vérifié côté serveur.
 */
export async function messagerieDisponible(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<boolean> {
  if (!peut(utilisateurConnecte, "MESSAGERIE", "VOIR")) return false;
  const [monEntreprise] = await tx
    .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
    .from(entreprise)
    .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  return Boolean(monEntreprise) && disponible(monEntreprise, "CHAT_INTERNE");
}

async function idsCanauxPrivesDe(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<Set<string>> {
  const lignes = await tx
    .select({ canalId: membreCanal.canalId })
    .from(membreCanal)
    .where(and(eq(membreCanal.utilisateurId, utilisateurConnecte.utilisateurId), eq(membreCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
  return new Set(lignes.map((l) => l.canalId));
}

/**
 * Canaux que l'utilisateur peut voir. Un canal PROJET suit la portée des Projets (Palier 2) ; un canal EQUIPE ou
 * LIBRE est visible de toute l'entreprise ; un message direct ou un groupe privé n'est visible que de ses membres —
 * l'Administrateur n'y échappe pas : un groupe privé est privé.
 */
export async function canauxAccessibles(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<CanalLigne[]> {
  const [idsProjets, tous, prives] = await Promise.all([
    projetsVisibles(tx, utilisateurConnecte),
    tx.select().from(canal).where(eq(canal.entrepriseId, utilisateurConnecte.entrepriseId)).orderBy(asc(canal.creeLe)),
    idsCanauxPrivesDe(tx, utilisateurConnecte),
  ]);
  return tous.filter((c) => {
    if (estCanalPrive(c.type)) return prives.has(c.id);
    if (c.type !== "PROJET") return true;
    return idsProjets === "TOUT" || (c.projetId ? idsProjets.includes(c.projetId) : false);
  });
}

/** Le canal demandé, seulement s'il fait partie de ceux que l'utilisateur a le droit de voir. */
export async function canalAccessible(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, canalId: string): Promise<CanalLigne | null> {
  if (!(await messagerieDisponible(tx, utilisateurConnecte))) return null;
  const [leCanal] = await tx.select().from(canal).where(and(eq(canal.id, canalId), eq(canal.entrepriseId, utilisateurConnecte.entrepriseId)));
  if (!leCanal) return null;

  if (estCanalPrive(leCanal.type)) {
    const [membre] = await tx
      .select({ id: membreCanal.id })
      .from(membreCanal)
      .where(and(eq(membreCanal.canalId, canalId), eq(membreCanal.utilisateurId, utilisateurConnecte.utilisateurId)));
    return membre ? leCanal : null;
  }
  if (leCanal.type !== "PROJET") return leCanal;
  const idsProjets = await projetsVisibles(tx, utilisateurConnecte);
  return idsProjets === "TOUT" || (leCanal.projetId && idsProjets.includes(leCanal.projetId)) ? leCanal : null;
}

/** Crée le canal « Général » de l'entreprise s'il n'existe pas encore (idempotent, sans doublon possible). */
export async function assurerCanalGeneral(tx: TransactionDrizzle, entrepriseId: string): Promise<void> {
  await tx
    .insert(canal)
    .values({ entrepriseId, nom: "Général", type: "EQUIPE", idFournisseurChat: idExterneCanal(entrepriseId, "general") })
    .onConflictDoNothing({ target: canal.idFournisseurChat });
}

export type Collegue = { id: string; nom: string; role: string; enLigne: boolean };

/**
 * Collègues avec qui discuter : les autres membres actifs de l'entreprise (jamais un client du portail), avec leur
 * présence. « En ligne » est calculé par la base (now()), la même horloge que celle qui enregistre l'activité.
 */
export async function listerCollegues(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<Collegue[]> {
  const lignes = await tx
    .select({
      id: utilisateur.id,
      nom: utilisateur.nomComplet,
      role: utilisateur.role,
      enLigne: sql<boolean>`coalesce(${utilisateur.derniereActiviteLe} > now() - make_interval(secs => ${DELAI_EN_LIGNE_SECONDES}), false)`,
    })
    .from(utilisateur)
    .where(
      and(
        eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId),
        eq(utilisateur.statut, "ACTIF"),
        ne(utilisateur.role, "CLIENT"),
        ne(utilisateur.id, utilisateurConnecte.utilisateurId)
      )
    )
    .orderBy(asc(utilisateur.nomComplet));
  return lignes;
}

/** Note que l'utilisateur est actif maintenant (au plus une écriture toutes les 30 secondes). */
export async function enregistrerActivite(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<void> {
  await tx
    .update(utilisateur)
    .set({ derniereActiviteLe: sql`now()` })
    .where(
      and(
        eq(utilisateur.id, utilisateurConnecte.utilisateurId),
        eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId),
        sql`(${utilisateur.derniereActiviteLe} is null or ${utilisateur.derniereActiviteLe} < now() - interval '30 seconds')`
      )
    );
}

/**
 * Ouvre (ou retrouve) la conversation directe entre l'utilisateur et un collègue. Idempotent : l'identifiant du
 * canal est déterministe (les deux identifiants triés), donc jamais deux conversations pour la même paire.
 * Le collègue est relu en base : même entreprise, actif, jamais un client du portail, jamais soi-même.
 */
export async function ouvrirConversationDirecte(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, autreId: string): Promise<string | null> {
  if (!(await messagerieDisponible(tx, utilisateurConnecte))) return null;
  if (autreId === utilisateurConnecte.utilisateurId) return null;

  const [autre] = await tx
    .select({ id: utilisateur.id })
    .from(utilisateur)
    .where(and(eq(utilisateur.id, autreId), eq(utilisateur.entrepriseId, utilisateurConnecte.entrepriseId), eq(utilisateur.statut, "ACTIF"), ne(utilisateur.role, "CLIENT")));
  if (!autre) return null;

  const paire = [utilisateurConnecte.utilisateurId, autre.id].sort().join("-");
  const idFournisseurChat = idExterneCanal(utilisateurConnecte.entrepriseId, `dm-${paire}`);

  await tx
    .insert(canal)
    .values({ entrepriseId: utilisateurConnecte.entrepriseId, nom: "Message direct", type: "DIRECT", idFournisseurChat })
    .onConflictDoNothing({ target: canal.idFournisseurChat });
  const [leCanal] = await tx.select({ id: canal.id }).from(canal).where(eq(canal.idFournisseurChat, idFournisseurChat));
  if (!leCanal) return null;

  await tx
    .insert(membreCanal)
    .values([
      { entrepriseId: utilisateurConnecte.entrepriseId, canalId: leCanal.id, utilisateurId: utilisateurConnecte.utilisateurId },
      { entrepriseId: utilisateurConnecte.entrepriseId, canalId: leCanal.id, utilisateurId: autre.id },
    ])
    .onConflictDoNothing();
  return leCanal.id;
}

/** Pour chaque conversation directe de l'utilisateur : l'identifiant du canal et celui de son interlocuteur. */
export async function interlocuteursDirects(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, idsCanauxDirects: string[]): Promise<Record<string, string>> {
  if (idsCanauxDirects.length === 0) return {};
  const lignes = await tx
    .select({ canalId: membreCanal.canalId, utilisateurId: membreCanal.utilisateurId })
    .from(membreCanal)
    .where(and(inArray(membreCanal.canalId, idsCanauxDirects), ne(membreCanal.utilisateurId, utilisateurConnecte.utilisateurId)));
  return Object.fromEntries(lignes.map((l) => [l.canalId, l.utilisateurId]));
}

export type MembreCanal = { id: string; nom: string };

/** Membres d'un canal privé (groupe ou message direct), par ordre alphabétique. */
export async function membresDuCanal(tx: TransactionDrizzle, canalId: string): Promise<MembreCanal[]> {
  return tx
    .select({ id: utilisateur.id, nom: utilisateur.nomComplet })
    .from(membreCanal)
    .innerJoin(utilisateur, eq(utilisateur.id, membreCanal.utilisateurId))
    .where(eq(membreCanal.canalId, canalId))
    .orderBy(asc(utilisateur.nomComplet));
}

/**
 * Personnes que l'on peut mentionner dans ce canal : les membres d'un canal privé, ou tous les collègues actifs
 * pour un canal ouvert (le serveur revérifie ensuite que chaque personne mentionnée peut réellement le voir).
 */
export async function candidatsMentions(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, leCanal: CanalLigne): Promise<MembreCanal[]> {
  if (estCanalPrive(leCanal.type)) return (await membresDuCanal(tx, leCanal.id)).filter((m) => m.id !== utilisateurConnecte.utilisateurId);
  return (await listerCollegues(tx, utilisateurConnecte)).map((c) => ({ id: c.id, nom: c.nom }));
}

const champsMessage = {
  id: messageCanal.id,
  auteurId: messageCanal.auteurId,
  auteurNom: utilisateur.nomComplet,
  contenu: messageCanal.contenu,
  supprimeLe: messageCanal.supprimeLe,
  parentId: messageCanal.parentId,
  pieceNom: messageCanal.pieceJointeNom,
  pieceType: messageCanal.pieceJointeType,
  pieceTaille: messageCanal.pieceJointeTaille,
  creeLe: messageCanal.creeLe,
  misAJourLe: messageCanal.misAJourLe,
};

type LigneMessage = {
  id: string;
  auteurId: string;
  auteurNom: string;
  contenu: string;
  supprimeLe: Date | null;
  parentId: string | null;
  pieceNom: string | null;
  pieceType: string | null;
  pieceTaille: number | null;
  creeLe: Date;
  misAJourLe: Date;
};

/** Réactions regroupées par message et par emoji (dans l'ordre de la première réaction), avec « ai-je réagi ? ». */
export async function reactionsDe(tx: TransactionDrizzle, idsMessages: string[], moiId: string): Promise<Map<string, ReactionAffichee[]>> {
  const parMessage = new Map<string, ReactionAffichee[]>();
  if (idsMessages.length === 0) return parMessage;
  const lignes = await tx
    .select({
      messageId: reactionMessage.messageId,
      emoji: reactionMessage.emoji,
      total: sql<number>`count(*)::int`,
      moi: sql<boolean>`bool_or(${reactionMessage.utilisateurId} = ${moiId})`,
    })
    .from(reactionMessage)
    .where(inArray(reactionMessage.messageId, idsMessages))
    .groupBy(reactionMessage.messageId, reactionMessage.emoji)
    .orderBy(sql`min(${reactionMessage.creeLe})`);
  for (const l of lignes) {
    const liste = parMessage.get(l.messageId) ?? [];
    liste.push({ emoji: l.emoji, total: l.total, moi: l.moi });
    parMessage.set(l.messageId, liste);
  }
  return parMessage;
}

async function enrichir(tx: TransactionDrizzle, lignes: LigneMessage[], moiId: string): Promise<MessageAffiche[]> {
  const ids = lignes.map((l) => l.id);
  const [reactions, reponses] = await Promise.all([
    reactionsDe(tx, ids, moiId),
    ids.length
      ? tx
          .select({ parentId: messageCanal.parentId, total: sql<number>`count(*)::int` })
          .from(messageCanal)
          .where(and(inArray(messageCanal.parentId, ids), isNull(messageCanal.supprimeLe)))
          .groupBy(messageCanal.parentId)
      : Promise.resolve([] as { parentId: string | null; total: number }[]),
  ]);
  const nbReponses = new Map(reponses.map((r) => [r.parentId, r.total]));

  return lignes.map((l) => ({
    id: l.id,
    auteurId: l.auteurId,
    auteurNom: l.auteurNom,
    // Un message supprimé ne renvoie jamais son texte (ni sa pièce jointe, ni ses réactions) au navigateur.
    contenu: l.supprimeLe ? null : l.contenu,
    supprime: Boolean(l.supprimeLe),
    piece: !l.supprimeLe && l.pieceNom && l.pieceType ? { nom: l.pieceNom, type: l.pieceType, taille: l.pieceTaille ?? 0, image: l.pieceType.startsWith("image/") } : null,
    parentId: l.parentId,
    nbReponses: nbReponses.get(l.id) ?? 0,
    reactions: l.supprimeLe ? [] : (reactions.get(l.id) ?? []),
    creeLe: l.creeLe.toISOString(),
    misAJourLe: l.misAJourLe.toISOString(),
  }));
}

type FiltreMessages = { apres?: Date; avant?: Date; limite?: number; fil?: string };

/**
 * Messages d'un canal, du plus ancien au plus récent.
 * - sans filtre : les derniers messages de la chronologie (les réponses de fil n'y figurent pas) ;
 * - `avant` : une page plus ancienne (historique) ;
 * - `apres` : tout ce qui a changé depuis (nouveaux messages, suppressions, réactions, réponses), pour la mise à
 *   jour quasi instantanée de la conversation ;
 * - `fil` : le fil d'un message — ce message et ses réponses.
 */
export async function chargerMessages(tx: TransactionDrizzle, canalId: string, moiId: string, filtre: FiltreMessages = {}): Promise<MessageAffiche[]> {
  const limite = Math.min(filtre.limite ?? 50, 200);
  const portee = filtre.fil ? or(eq(messageCanal.parentId, filtre.fil), eq(messageCanal.id, filtre.fil)) : isNull(messageCanal.parentId);
  const temps = filtre.apres ? gt(messageCanal.misAJourLe, filtre.apres) : filtre.avant ? lt(messageCanal.creeLe, filtre.avant) : undefined;

  const lignes = await tx
    .select(champsMessage)
    .from(messageCanal)
    .innerJoin(utilisateur, eq(messageCanal.auteurId, utilisateur.id))
    .where(and(eq(messageCanal.canalId, canalId), portee, temps))
    // Les plus récents d'abord pour couper à la limite, puis remis dans l'ordre de lecture.
    .orderBy(filtre.apres || filtre.fil ? asc(messageCanal.creeLe) : desc(messageCanal.creeLe))
    .limit(limite);

  const ordonnees = filtre.apres || filtre.fil ? lignes : lignes.reverse();
  return enrichir(tx, ordonnees, moiId);
}

/**
 * Fenêtre de la chronologie centrée sur un message (résultat de recherche) : jusqu'à 25 messages avant et 25 après.
 * Si la cible est une réponse de fil, on centre sur son message d'origine.
 */
export async function chargerAutour(tx: TransactionDrizzle, canalId: string, messageId: string, moiId: string): Promise<{ messages: MessageAffiche[]; racineId: string } | null> {
  const [cible] = await tx
    .select({ id: messageCanal.id, parentId: messageCanal.parentId, creeLe: messageCanal.creeLe })
    .from(messageCanal)
    .where(and(eq(messageCanal.id, messageId), eq(messageCanal.canalId, canalId)));
  if (!cible) return null;

  let racineId = cible.id;
  let creeLe = cible.creeLe;
  if (cible.parentId) {
    const [racine] = await tx.select({ id: messageCanal.id, creeLe: messageCanal.creeLe }).from(messageCanal).where(and(eq(messageCanal.id, cible.parentId), eq(messageCanal.canalId, canalId)));
    if (!racine) return null;
    racineId = racine.id;
    creeLe = racine.creeLe;
  }

  const [avant, apres] = await Promise.all([
    tx.select({ id: messageCanal.id }).from(messageCanal).where(and(eq(messageCanal.canalId, canalId), isNull(messageCanal.parentId), lt(messageCanal.creeLe, creeLe))).orderBy(desc(messageCanal.creeLe)).limit(25),
    tx.select({ id: messageCanal.id }).from(messageCanal).where(and(eq(messageCanal.canalId, canalId), isNull(messageCanal.parentId), gt(messageCanal.creeLe, creeLe))).orderBy(asc(messageCanal.creeLe)).limit(25),
  ]);
  const ids = [...avant.map((m) => m.id), racineId, ...apres.map((m) => m.id)];
  const lignes = await tx
    .select(champsMessage)
    .from(messageCanal)
    .innerJoin(utilisateur, eq(messageCanal.auteurId, utilisateur.id))
    .where(inArray(messageCanal.id, ids))
    .orderBy(asc(messageCanal.creeLe));
  return { messages: await enrichir(tx, lignes, moiId), racineId };
}

export type ResultatRecherche = {
  messageId: string;
  canalId: string;
  /** Dans un fil : l'identifiant du message d'origine. */
  parentId: string | null;
  auteurNom: string;
  extrait: string;
  creeLe: string;
};

const EXTRAIT_AVANT = 40;
const EXTRAIT_APRES = 100;

/** Court extrait du message autour de la première occurrence de la recherche. */
export function extraitAutour(texte: string, saisie: string): string {
  const propre = texte.replace(/\s+/g, " ").trim();
  const position = propre.toLowerCase().indexOf(saisie.toLowerCase());
  if (position < 0) return propre.length > EXTRAIT_APRES ? `${propre.slice(0, EXTRAIT_APRES)}…` : propre;
  const debut = Math.max(0, position - EXTRAIT_AVANT);
  const fin = Math.min(propre.length, position + saisie.length + EXTRAIT_APRES);
  return `${debut > 0 ? "…" : ""}${propre.slice(debut, fin)}${fin < propre.length ? "…" : ""}`;
}

export const LONGUEUR_MIN_RECHERCHE = 2;
export const LONGUEUR_MAX_RECHERCHE = 100;

/**
 * Recherche dans les messages (texte et nom des pièces jointes) des SEULS canaux que l'utilisateur peut voir :
 * jamais le contenu d'un groupe privé ou d'un message direct dont il n'est pas membre, ni celui d'un projet hors de
 * sa portée. Les messages supprimés sont exclus.
 */
export async function rechercherMessages(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, saisieBrute: string, limite = 30): Promise<ResultatRecherche[]> {
  const saisie = saisieBrute.trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  if (saisie.length < LONGUEUR_MIN_RECHERCHE) return [];
  if (!(await messagerieDisponible(tx, utilisateurConnecte))) return [];

  const canaux = await canauxAccessibles(tx, utilisateurConnecte);
  if (canaux.length === 0) return [];
  const motif = `%${echapperMotifRecherche(saisie)}%`;

  const lignes = await tx
    .select({
      id: messageCanal.id,
      canalId: messageCanal.canalId,
      parentId: messageCanal.parentId,
      auteurNom: utilisateur.nomComplet,
      contenu: messageCanal.contenu,
      pieceNom: messageCanal.pieceJointeNom,
      creeLe: messageCanal.creeLe,
    })
    .from(messageCanal)
    .innerJoin(utilisateur, eq(messageCanal.auteurId, utilisateur.id))
    .where(
      and(
        inArray(messageCanal.canalId, canaux.map((c) => c.id)),
        isNull(messageCanal.supprimeLe),
        or(sql`${messageCanal.contenu} ilike ${motif}`, sql`${messageCanal.pieceJointeNom} ilike ${motif}`)
      )
    )
    .orderBy(desc(messageCanal.creeLe))
    .limit(Math.min(limite, 50));

  return lignes.map((l) => ({
    messageId: l.id,
    canalId: l.canalId,
    parentId: l.parentId,
    auteurNom: l.auteurNom,
    extrait: l.contenu && l.contenu.toLowerCase().includes(saisie.toLowerCase()) ? extraitAutour(l.contenu, saisie) : l.pieceNom ? `Pièce jointe : ${l.pieceNom}` : extraitAutour(l.contenu, saisie),
    creeLe: l.creeLe.toISOString(),
  }));
}

/** Note que l'utilisateur a vu ce canal maintenant (remet son compteur de non-lus à zéro). */
export async function marquerCanalLu(tx: TransactionDrizzle, entrepriseId: string, canalId: string, utilisateurId: string): Promise<void> {
  await tx
    .insert(lectureCanal)
    .values({ entrepriseId, canalId, utilisateurId, derniereLectureLe: sql`now()` })
    .onConflictDoUpdate({ target: [lectureCanal.canalId, lectureCanal.utilisateurId], set: { derniereLectureLe: sql`now()` } });
}

/**
 * Nombre de messages non lus par canal : ceux des AUTRES arrivés depuis le dernier passage de l'utilisateur
 * (tous ceux des autres s'il n'est jamais venu). Les messages supprimés ne comptent pas.
 */
export async function compterNonLus(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, idsCanaux: string[]): Promise<Record<string, number>> {
  if (idsCanaux.length === 0) return {};
  const lignes = await tx
    .select({ canalId: messageCanal.canalId, total: sql<number>`count(*)::int` })
    .from(messageCanal)
    .leftJoin(lectureCanal, and(eq(lectureCanal.canalId, messageCanal.canalId), eq(lectureCanal.utilisateurId, utilisateurConnecte.utilisateurId)))
    .where(
      and(
        inArray(messageCanal.canalId, idsCanaux),
        ne(messageCanal.auteurId, utilisateurConnecte.utilisateurId),
        sql`${messageCanal.supprimeLe} is null`,
        sql`(${lectureCanal.derniereLectureLe} is null or ${messageCanal.creeLe} > ${lectureCanal.derniereLectureLe})`
      )
    )
    .groupBy(messageCanal.canalId);
  return Object.fromEntries(lignes.map((l) => [l.canalId, l.total]));
}

/** Total de messages non lus, tous canaux visibles confondus (badge du menu). */
export async function totalNonLus(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<number> {
  if (!(await messagerieDisponible(tx, utilisateurConnecte))) return 0;
  const canaux = await canauxAccessibles(tx, utilisateurConnecte);
  const parCanal = await compterNonLus(tx, utilisateurConnecte, canaux.map((c) => c.id));
  return Object.values(parCanal).reduce((somme, n) => somme + n, 0);
}
