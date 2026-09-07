import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { minuteurActif, projet, tache } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/session";

export type MinuteurActifAffiche = {
  id: string;
  projetId: string;
  projetTitre: string;
  tacheTitre: string | null;
  demarreLe: Date;
};

/**
 * Lecture partagée entre la fiche Projet et la page transverse Feuille de
 * temps (src/lib/actions/minuteur.ts porte les mutations) — un seul
 * minuteur actif par utilisateur (contrainte unique en base sur
 * minuteurActif.utilisateurId).
 */
export async function recupererMinuteurActif(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte): Promise<MinuteurActifAffiche | null> {
  const [actif] = await tx.select().from(minuteurActif).where(eq(minuteurActif.utilisateurId, utilisateurConnecte.utilisateurId));
  if (!actif) return null;

  const [leProjet] = await tx.select({ titre: projet.titre }).from(projet).where(eq(projet.id, actif.projetId));
  const [laTache] = actif.tacheId ? await tx.select({ titre: tache.titre }).from(tache).where(eq(tache.id, actif.tacheId)) : [undefined];

  return {
    id: actif.id,
    projetId: actif.projetId,
    projetTitre: leProjet?.titre ?? "",
    tacheTitre: laTache?.titre ?? null,
    demarreLe: actif.demarreLe,
  };
}
