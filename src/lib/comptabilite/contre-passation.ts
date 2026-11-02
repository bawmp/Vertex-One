import { and, eq, isNull, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { TransactionDrizzle } from "@/db/client";
import { ecritureComptable, entreprise } from "@/db/schema";
import { verifierDateNonVerrouillee } from "./verrouillage";

/**
 * Contre-passation (2026-11-02) : annuler une facture, un ticket de vente ou une facture fournisseur doit défaire ses écritures, pas
 * seulement changer son statut. Chaque écriture d'origine reçoit une écriture miroir (débit et crédit inversés) datée du jour de
 * l'annulation, qui garde les mêmes références (facture, ticket…) et porte l'identifiant de l'original. L'historique reste intact :
 * rien n'est supprimé ni modifié, une annulation s'ajoute.
 *
 * Les règlements déjà encaissés (écritures avec `paiement_id`) ne sont PAS contre-passés par l'appelant : l'argent reçu reste reçu, le
 * client apparaît créditeur du montant payé, à lui rembourser. Une écriture déjà contre-passée, ou qui est elle-même une
 * contre-passation, n'est jamais reprise : refaire l'annulation ne produit rien.
 */
export async function contrePasserEcritures(tx: TransactionDrizzle, entrepriseId: string, condition: SQL, motif: string, date: Date = new Date()): Promise<number> {
  const [monEntreprise] = await tx.select({ verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  const erreurVerrou = verifierDateNonVerrouillee(monEntreprise?.verrou ?? null, date);
  if (erreurVerrou) throw new Error(erreurVerrou);

  const miroir = alias(ecritureComptable, "miroir");
  const originales = await tx
    .select()
    .from(ecritureComptable)
    .where(
      and(
        eq(ecritureComptable.entrepriseId, entrepriseId),
        isNull(ecritureComptable.contrepasseId),
        condition,
        notExists(tx.select({ un: sql`1` }).from(miroir).where(eq(miroir.contrepasseId, ecritureComptable.id)))
      )
    );
  if (originales.length === 0) return 0;

  await tx.insert(ecritureComptable).values(
    originales.map((o) => ({
      entrepriseId,
      dateEcriture: date,
      libelle: `Annulation — ${motif} (${o.libelle})`.slice(0, 250),
      compteId: o.compteId,
      debit: o.credit,
      credit: o.debit,
      factureId: o.factureId,
      depenseId: o.depenseId,
      factureFournisseurId: o.factureFournisseurId,
      recuVenteId: o.recuVenteId,
      factureAcompteId: o.factureAcompteId,
      contrepasseId: o.id,
    }))
  );
  return originales.length;
}

/** Les écritures d'origine d'une facture de vente : sa facturation et l'application d'un acompte, jamais ses règlements. */
export const ecrituresDeLaFacture = (factureId: string): SQL => and(eq(ecritureComptable.factureId, factureId), isNull(ecritureComptable.paiementId), isNull(ecritureComptable.journalManuelId))!;

/** Les écritures d'un ticket de vente (encaissé à la création : toutes sont d'origine). */
export const ecrituresDuTicket = (recuVenteId: string): SQL => eq(ecritureComptable.recuVenteId, recuVenteId);

/** Les écritures d'une facture fournisseur, jamais ses règlements. */
export const ecrituresDeLaFactureFournisseur = (factureFournisseurId: string): SQL => and(eq(ecritureComptable.factureFournisseurId, factureFournisseurId), isNull(ecritureComptable.paiementEffectueId))!;
