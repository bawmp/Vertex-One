import { and, count, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lead, utilisateur } from "@/db/schema";
import { peut, type Module } from "@/lib/permissions";
import { choisirParTourDeRole, lireChoixAssignation, MAX_RECEVEURS_REPARTITION, type ChoixAssignation, type RegleAssignation } from "./assignation-regle";

/** Fenêtre de comptage du tour de rôle : un nouvel arrivant ne reçoit pas tous les prospects pour « rattraper » un historique entier. */
const JOURS_FENETRE_REPARTITION = 30;

export type Receveur = { id: string; nomComplet: string; email: string; role: "ADMIN" | "MANAGER" | "EMPLOYE" | "COMPTABLE" | "CLIENT" };

/**
 * Les personnes de l'entreprise à qui l'on peut confier des prospects : membres ACTIFS de CETTE entreprise (filtre explicite : `utilisateur` est en
 * RLS permissive), qui peuvent voir ET travailler le CRM selon leur rôle et la liste de modules posée par l'Administrateur. Jamais un client du
 * portail, ni quelqu'un à qui le CRM est fermé (il recevrait un prospect qu'il ne verrait pas).
 */
export async function receveursPossibles(tx: TransactionDrizzle, entrepriseId: string, ids?: string[]): Promise<Receveur[]> {
  if (ids && ids.length === 0) return [];
  const lignes = await tx
    .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet, email: utilisateur.email, role: utilisateur.role, modulesAutorises: utilisateur.modulesAutorises })
    .from(utilisateur)
    .where(and(eq(utilisateur.entrepriseId, entrepriseId), eq(utilisateur.statut, "ACTIF"), ...(ids ? [inArray(utilisateur.id, ids)] : [])));
  return lignes
    .filter((u) => {
      const sujet = { role: u.role, modulesAutorises: u.modulesAutorises as Module[] | null };
      return u.role !== "CLIENT" && peut(sujet, "CRM", "VOIR") && peut(sujet, "CRM", "MODIFIER");
    })
    .map(({ id, nomComplet, email, role }) => ({ id, nomComplet, email, role }))
    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));
}

/**
 * Applique la règle d'une clé ou d'une page : renvoie la personne qui reçoit le prospect, ou null (règle absente, personne retirée / désactivée /
 * sans accès au CRM) — l'appelant retombe alors sur le premier administrateur, un prospect n'est jamais perdu.
 * Le tour de rôle compte les prospects de sites déjà reçus par chacun (30 jours) sous un verrou de la transaction : deux prospects simultanés
 * ne vont jamais à la même personne par hasard de timing.
 */
export async function choisirAssigne(tx: TransactionDrizzle, entrepriseId: string, regle: RegleAssignation | null): Promise<Receveur | null> {
  if (!regle) return null;

  if (regle.mode === "PERSONNE") {
    const [personne] = await receveursPossibles(tx, entrepriseId, [regle.utilisateurId]);
    return personne ?? null;
  }

  const possibles = await receveursPossibles(tx, entrepriseId, regle.utilisateurIds.slice(0, MAX_RECEVEURS_REPARTITION));
  if (possibles.length === 0) return null;

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`repartition-leads:${entrepriseId}`}))`);
  const depuis = new Date(Date.now() - JOURS_FENETRE_REPARTITION * 86_400_000);
  const lignes = await tx
    .select({ assigneAId: lead.assigneAId, n: count() })
    .from(lead)
    .where(and(eq(lead.entrepriseId, entrepriseId), isNotNull(lead.sourceExterne), gte(lead.creeLe, depuis), inArray(lead.assigneAId, possibles.map((p) => p.id))))
    .groupBy(lead.assigneAId);
  const comptes = new Map(lignes.map((l) => [l.assigneAId, Number(l.n)]));

  // L'ordre de la liste choisie par l'Administrateur départage les égalités.
  const ordre = regle.utilisateurIds.filter((id) => possibles.some((p) => p.id === id));
  const gagnant = choisirParTourDeRole(ordre, comptes);
  return possibles.find((p) => p.id === gagnant) ?? null;
}

/**
 * Valide le choix envoyé par le navigateur AVANT de l'enregistrer : forme correcte, et chaque personne citée est un membre actif de l'entreprise de
 * l'appelant qui peut recevoir des prospects (jamais un identifiant d'une autre entreprise). Renvoie la règle à enregistrer (null = premier
 * administrateur) ou une erreur lisible.
 */
export async function validerChoixAssignation(
  tx: TransactionDrizzle,
  entrepriseId: string,
  brut: unknown
): Promise<{ regle: RegleAssignation | null } | { erreur: "FORME" | "PERSONNE_INVALIDE" }> {
  const choix: ChoixAssignation | null = lireChoixAssignation(brut);
  if (!choix) return { erreur: "FORME" };
  if (choix.mode === "ADMIN") return { regle: null };

  const ids = choix.mode === "PERSONNE" ? [choix.utilisateurId] : choix.utilisateurIds;
  const valides = await receveursPossibles(tx, entrepriseId, ids);
  if (valides.length !== ids.length) return { erreur: "PERSONNE_INVALIDE" };
  return { regle: choix };
}
