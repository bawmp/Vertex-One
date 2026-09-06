import { eq, and, gte, lt, inArray, desc, sql } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { tache, projet, dossier, utilisateur } from "@/db/schema";
import { idsVisibles } from "@/lib/portee";
import type { UtilisateurConnecte } from "@/lib/session";

export type TacheActivite = { id: string; titre: string; termineeLe: Date; projetTitre: string; dossierTitre: string | null };

/**
 * Docs/palier-5-*, section 2bis : capacité déjà permise par les données du
 * Palier 2 (Tache.termineeLe) — il ne manquait qu'un moyen de l'interroger
 * par employé et par période. Ne nécessite pas le forfait Business : réutilise
 * la portée EQUIPE/TOUT déjà couverte par le Pro (voir la note de plan-gating
 * dans le doc).
 */
export async function activiteEmploye(
  tx: TransactionDrizzle,
  demandeur: UtilisateurConnecte,
  employeId: string,
  dateDebut: Date,
  dateFin: Date
): Promise<TacheActivite[]> {
  const idsAutorises = await idsVisibles(tx, demandeur, "RH");
  if (idsAutorises !== "TOUT" && !idsAutorises.includes(employeId)) {
    return [];
  }

  const lignes = await tx
    .select({ id: tache.id, titre: tache.titre, termineeLe: tache.termineeLe, projetTitre: projet.titre, dossierTitre: dossier.titre })
    .from(tache)
    .innerJoin(projet, eq(tache.projetId, projet.id))
    .leftJoin(dossier, eq(projet.dossierId, dossier.id))
    .where(and(eq(tache.assigneAId, employeId), gte(tache.termineeLe, dateDebut), lt(tache.termineeLe, dateFin)))
    .orderBy(desc(tache.termineeLe));

  // termineeLe est NOT NULL dans les résultats ici (exclu par gte()/lt() au
  // WHERE), même si la colonne reste nullable dans le schéma en général.
  return lignes as TacheActivite[];
}

export type LigneTableauEquipe = { utilisateurId: string; nomComplet: string; tachesTerminees: number };

/**
 * Vue d'ensemble pour un Manager/Administrateur avant de creuser le détail
 * d'un employé (docs/palier-5-*, section 2bis).
 */
export async function tableauEquipe(
  tx: TransactionDrizzle,
  entrepriseId: string,
  demandeur: UtilisateurConnecte,
  dateDebut: Date,
  dateFin: Date
): Promise<LigneTableauEquipe[]> {
  const ids = await idsVisibles(tx, demandeur, "RH");

  const membres = await tx
    .select({ id: utilisateur.id, nomComplet: utilisateur.nomComplet })
    .from(utilisateur)
    .where(ids === "TOUT" ? eq(utilisateur.entrepriseId, entrepriseId) : inArray(utilisateur.id, ids));

  const resultats: LigneTableauEquipe[] = [];
  for (const m of membres) {
    const [ligne] = await tx
      .select({ compte: sql<number>`count(*)::int` })
      .from(tache)
      .where(and(eq(tache.assigneAId, m.id), gte(tache.termineeLe, dateDebut), lt(tache.termineeLe, dateFin)));
    resultats.push({ utilisateurId: m.id, nomComplet: m.nomComplet, tachesTerminees: ligne?.compte ?? 0 });
  }

  return resultats;
}
