import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { emailEnvoye, utilisateur } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";
import { echapperMotifRecherche } from "@/lib/messagerie/mentions";

/**
 * Qui voit quoi dans la souche des emails envoyés : l'Administrateur voit tous ceux de son entreprise ; les autres ne
 * voient que ceux qu'ils ont eux-mêmes envoyés (jamais un envoi automatique ni celui d'un collègue). Le filtre
 * `entrepriseId` est explicite en plus de la RLS.
 */
function visibles(demandeur: UtilisateurConnecte): SQL {
  const entreprise = eq(emailEnvoye.entrepriseId, demandeur.entrepriseId);
  return demandeur.role === "ADMIN" ? entreprise : and(entreprise, eq(emailEnvoye.auteurId, demandeur.utilisateurId))!;
}

export type LigneSouche = {
  id: string;
  destinataire: string;
  sujet: string;
  type: string;
  envoyeLe: Date;
  nbPiecesJointes: number;
  auteurNom: string | null;
};

export async function listerSouche(tx: TransactionDrizzle, demandeur: UtilisateurConnecte, options: { recherche?: string; type?: string; limite: number }): Promise<LigneSouche[]> {
  const motif = options.recherche?.trim() ? `%${echapperMotifRecherche(options.recherche.trim())}%` : null;
  const conditions = [
    visibles(demandeur),
    options.type ? eq(emailEnvoye.type, options.type) : undefined,
    motif ? or(ilike(emailEnvoye.destinataire, motif), ilike(emailEnvoye.sujet, motif)) : undefined,
  ].filter((c): c is SQL => c !== undefined);

  const lignes = await tx
    .select({
      id: emailEnvoye.id,
      destinataire: emailEnvoye.destinataire,
      sujet: emailEnvoye.sujet,
      type: emailEnvoye.type,
      envoyeLe: emailEnvoye.envoyeLe,
      piecesJointes: emailEnvoye.piecesJointes,
      auteurNom: utilisateur.nomComplet,
    })
    .from(emailEnvoye)
    .leftJoin(utilisateur, eq(utilisateur.id, emailEnvoye.auteurId))
    .where(and(...conditions))
    .orderBy(desc(emailEnvoye.envoyeLe))
    .limit(options.limite);
  return lignes.map((l) => ({ id: l.id, destinataire: l.destinataire, sujet: l.sujet, type: l.type, envoyeLe: l.envoyeLe, nbPiecesJointes: l.piecesJointes.length, auteurNom: l.auteurNom }));
}

/** Emails envoyés à un contact précis (fiche du contact), du plus récent au plus ancien — mêmes règles de visibilité que la liste générale. */
export async function listerSoucheContact(tx: TransactionDrizzle, demandeur: UtilisateurConnecte, contactId: string): Promise<LigneSouche[]> {
  const lignes = await tx
    .select({
      id: emailEnvoye.id,
      destinataire: emailEnvoye.destinataire,
      sujet: emailEnvoye.sujet,
      type: emailEnvoye.type,
      envoyeLe: emailEnvoye.envoyeLe,
      piecesJointes: emailEnvoye.piecesJointes,
      auteurNom: utilisateur.nomComplet,
    })
    .from(emailEnvoye)
    .leftJoin(utilisateur, eq(utilisateur.id, emailEnvoye.auteurId))
    .where(and(visibles(demandeur), eq(emailEnvoye.contactId, contactId)))
    .orderBy(desc(emailEnvoye.envoyeLe))
    .limit(50);
  return lignes.map((l) => ({ id: l.id, destinataire: l.destinataire, sujet: l.sujet, type: l.type, envoyeLe: l.envoyeLe, nbPiecesJointes: l.piecesJointes.length, auteurNom: l.auteurNom }));
}

export async function lireSouche(tx: TransactionDrizzle, demandeur: UtilisateurConnecte, id: string) {
  const [ligne] = await tx
    .select({
      id: emailEnvoye.id,
      destinataire: emailEnvoye.destinataire,
      sujet: emailEnvoye.sujet,
      corpsHtml: emailEnvoye.corpsHtml,
      piecesJointes: emailEnvoye.piecesJointes,
      type: emailEnvoye.type,
      envoyeLe: emailEnvoye.envoyeLe,
      contactId: emailEnvoye.contactId,
      auteurNom: utilisateur.nomComplet,
    })
    .from(emailEnvoye)
    .leftJoin(utilisateur, eq(utilisateur.id, emailEnvoye.auteurId))
    .where(and(eq(emailEnvoye.id, id), visibles(demandeur)));
  return ligne ?? null;
}
