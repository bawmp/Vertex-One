import { eq, and, notInArray, notExists } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { dossier, projet } from "@/db/schema";

/**
 * Dossiers actifs sans aucun projet en cours — signal "client en sommeil à
 * relancer commercialement" (docs/palier-2-*, section 7 : indicateur du
 * tableau de bord ; docs/palier-6-*, section 2 : réutilisé tel quel par
 * l'automatisation verifierClientsEnSommeil()). Extrait de src/app/app/page.tsx
 * en une seule fonction partagée plutôt que dupliqué dans les deux endroits.
 */
export async function dossiersSansProjetActif(tx: TransactionDrizzle, entrepriseId: string) {
  return tx
    .select({ id: dossier.id, titre: dossier.titre, contactId: dossier.contactId, dateOuverture: dossier.dateOuverture })
    .from(dossier)
    .where(
      and(
        eq(dossier.entrepriseId, entrepriseId),
        eq(dossier.statut, "ACTIF"),
        notExists(
          tx
            .select()
            .from(projet)
            .where(and(eq(projet.dossierId, dossier.id), notInArray(projet.statut, ["TERMINE", "ANNULE"])))
        )
      )
    );
}
