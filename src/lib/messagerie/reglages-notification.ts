import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { abonnementPush, canalSourdine, preferenceNotification } from "@/db/schema";
import { niveauValide, REGLAGES_PAR_DEFAUT, type ReglagesNotification } from "@/lib/messagerie/push";
import type { UtilisateurConnecte } from "@/lib/session";

export type EtatNotifications = ReglagesNotification & {
  /** Nombre d'appareils de la personne qui reçoivent les notifications push. */
  appareils: number;
  /** Le canal affiché est-il en sourdine pour elle ? */
  canalEnSourdine: boolean;
};

/** Réglages de notification de la personne (valeurs par défaut sans ligne), ses appareils abonnés et la sourdine du canal affiché. */
export async function chargerEtatNotifications(tx: TransactionDrizzle, utilisateurConnecte: UtilisateurConnecte, canalId: string | null): Promise<EtatNotifications> {
  const [reglages] = await tx
    .select()
    .from(preferenceNotification)
    .where(and(eq(preferenceNotification.entrepriseId, utilisateurConnecte.entrepriseId), eq(preferenceNotification.utilisateurId, utilisateurConnecte.utilisateurId)));
  const appareils = await tx
    .select({ id: abonnementPush.id })
    .from(abonnementPush)
    .where(and(eq(abonnementPush.entrepriseId, utilisateurConnecte.entrepriseId), eq(abonnementPush.utilisateurId, utilisateurConnecte.utilisateurId)));
  let canalEnSourdine = false;
  if (canalId) {
    const [ligne] = await tx
      .select({ id: canalSourdine.id })
      .from(canalSourdine)
      .where(and(eq(canalSourdine.entrepriseId, utilisateurConnecte.entrepriseId), eq(canalSourdine.utilisateurId, utilisateurConnecte.utilisateurId), eq(canalSourdine.canalId, canalId)));
    canalEnSourdine = Boolean(ligne);
  }
  return {
    niveau: reglages && niveauValide(reglages.niveau) ? reglages.niveau : REGLAGES_PAR_DEFAUT.niveau,
    son: reglages ? reglages.son : REGLAGES_PAR_DEFAUT.son,
    apercu: reglages ? reglages.apercu : REGLAGES_PAR_DEFAUT.apercu,
    appareils: appareils.length,
    canalEnSourdine,
  };
}
