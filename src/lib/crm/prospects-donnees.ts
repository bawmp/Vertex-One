import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { lead, relanceProspect, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

export type ProspectQualifie = {
  id: string;
  nom: string;
  societeCliente: string | null;
  telephone: string;
  email: string | null;
  notes: string | null;
  qualifieLe: Date | null;
  creeLe: Date;
  rappelLe: string | null;
  sourceExterne: string | null;
  assigneAId: string;
  assigneANom: string | null;
  derniereRelanceLe: Date | null;
  nbRelances: number;
};

/**
 * Prospects qualifiés : leads de statut QUALIFIE pas encore convertis, dans la portée CRM de la personne connectée
 * (un Manager ou un Employé ne voit que les siens, comme pour les Leads). `derniereRelanceLe` / `nbRelances` viennent de
 * l'historique des relances.
 */
export async function listerProspectsQualifies(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<ProspectQualifie[]> {
  const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
  if (visibles !== "TOUT" && visibles.length === 0) return [];

  const conditions = [eq(lead.statut, "QUALIFIE"), isNull(lead.convertiLe)];
  if (visibles !== "TOUT") conditions.push(inArray(lead.assigneAId, visibles));

  const lignes = await tx
    .select({
      id: lead.id,
      nom: lead.nom,
      societeCliente: lead.societeCliente,
      telephone: lead.telephone,
      email: lead.email,
      notes: lead.notes,
      qualifieLe: lead.qualifieLe,
      creeLe: lead.creeLe,
      rappelLe: lead.rappelLe,
      sourceExterne: lead.sourceExterne,
      assigneAId: lead.assigneAId,
      assigneANom: utilisateur.nomComplet,
      derniereRelanceLe: sql<Date | null>`(select max(${relanceProspect.creeLe}) from ${relanceProspect} where ${relanceProspect.leadId} = ${lead.id})`,
      nbRelances: sql<number>`(select count(*)::int from ${relanceProspect} where ${relanceProspect.leadId} = ${lead.id})`,
    })
    .from(lead)
    .leftJoin(utilisateur, and(eq(utilisateur.id, lead.assigneAId), eq(utilisateur.entrepriseId, lead.entrepriseId)))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${lead.qualifieLe}, ${lead.creeLe})`));

  return lignes.map((l) => ({
    ...l,
    // Une sous-requête `max()` brute revient en texte avec le pilote : on la remet en Date.
    derniereRelanceLe: l.derniereRelanceLe ? new Date(l.derniereRelanceLe as unknown as string) : null,
    nbRelances: Number(l.nbRelances ?? 0),
  }));
}

/** Nombre de prospects qualifiés visibles (pastille du menu, bandeau de la liste des Leads). */
export async function compterProspectsQualifies(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<number> {
  const visibles = await idsVisibles(tx, utilisateurConnecte, "CRM");
  if (visibles !== "TOUT" && visibles.length === 0) return 0;
  const conditions = [eq(lead.statut, "QUALIFIE"), isNull(lead.convertiLe)];
  if (visibles !== "TOUT") conditions.push(inArray(lead.assigneAId, visibles));
  const [ligne] = await tx.select({ n: sql<number>`count(*)::int` }).from(lead).where(and(...conditions));
  return Number(ligne?.n ?? 0);
}

export type LigneHistoriqueRelance = { id: string; canal: string; contenu: string; creeLe: Date; auteurNom: string | null };

/** Historique des relances d'UN prospect, du plus récent au plus ancien (le prospect doit avoir été relu avec sa portée par l'appelant). */
export async function historiqueRelances(tx: TransactionDrizzle, leadId: string, limite = 50): Promise<LigneHistoriqueRelance[]> {
  return tx
    .select({ id: relanceProspect.id, canal: relanceProspect.canal, contenu: relanceProspect.contenu, creeLe: relanceProspect.creeLe, auteurNom: utilisateur.nomComplet })
    .from(relanceProspect)
    .leftJoin(utilisateur, and(eq(utilisateur.id, relanceProspect.auteurId), eq(utilisateur.entrepriseId, relanceProspect.entrepriseId)))
    .where(eq(relanceProspect.leadId, leadId))
    .orderBy(desc(relanceProspect.creeLe))
    .limit(limite);
}
