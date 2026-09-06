import { eq, and, isNull, gte, lte } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { paiement, facture } from "@/db/schema";

export type LigneReleve = { date: Date; libelle: string; montant: number };

/**
 * Format CSV minimal attendu : trois colonnes "date,libelle,montant" (montant
 * en FCFA entier, sans décimales — voir CLAUDE.md sur le stockage monétaire),
 * une ligne d'en-tête optionnelle. C'est un MVP délibérément simple : les
 * relevés OFX (docs/palier-4-*, section 4) demandent un vrai parseur dédié,
 * différé tant qu'aucune banque cliente précise n'a été identifiée — même
 * traitement "stub documenté" que les autres intégrations externes de ce
 * projet (voir CLAUDE.md).
 */
export function parserCsvReleve(contenu: string): LigneReleve[] {
  const lignes = contenu
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const resultat: LigneReleve[] = [];
  for (const ligne of lignes) {
    const [dateBrute, libelle, montantBrut] = ligne.split(",").map((c) => c.trim());
    const date = new Date(dateBrute);
    const montant = Number(montantBrut);
    if (!dateBrute || Number.isNaN(date.getTime()) || !libelle || Number.isNaN(montant)) continue; // ligne d'en-tête ou invalide, ignorée
    resultat.push({ date, libelle, montant: Math.round(montant) });
  }
  return resultat;
}

export type SuggestionRapprochement = {
  ligne: LigneReleve;
  paiementsProbables: { id: string; montant: number; datePaiement: Date; numeroFacture: string }[];
};

const FENETRE_JOURS = 5;

/**
 * Propose des correspondances plutôt que d'exiger un pointage entièrement
 * manuel (docs/palier-4-*, section 4) : même montant exact, date à
 * FENETRE_JOURS près, paiement pas déjà rapproché. Plusieurs paiements
 * probables peuvent être retournés pour une même ligne — à l'utilisateur de
 * trancher si plusieurs paiements du même montant tombent dans la fenêtre.
 */
export async function suggererCorrespondances(
  tx: TransactionDrizzle,
  entrepriseId: string,
  lignesReleve: LigneReleve[]
): Promise<SuggestionRapprochement[]> {
  const suggestions: SuggestionRapprochement[] = [];

  for (const ligne of lignesReleve) {
    const debutFenetre = new Date(ligne.date);
    debutFenetre.setDate(debutFenetre.getDate() - FENETRE_JOURS);
    const finFenetre = new Date(ligne.date);
    finFenetre.setDate(finFenetre.getDate() + FENETRE_JOURS);

    const candidats = await tx
      .select({ id: paiement.id, montant: paiement.montant, datePaiement: paiement.datePaiement, numero: facture.numero })
      .from(paiement)
      .innerJoin(facture, eq(paiement.factureId, facture.id))
      .where(
        and(
          eq(paiement.entrepriseId, entrepriseId),
          isNull(paiement.rapprocheLe),
          eq(paiement.montant, ligne.montant),
          gte(paiement.datePaiement, debutFenetre),
          lte(paiement.datePaiement, finFenetre)
        )
      );

    suggestions.push({
      ligne,
      paiementsProbables: candidats.map((c) => ({ id: c.id, montant: c.montant, datePaiement: c.datePaiement, numeroFacture: c.numero })),
    });
  }

  return suggestions;
}

export async function confirmerRapprochement(tx: TransactionDrizzle, paiementId: string): Promise<void> {
  await tx.update(paiement).set({ rapprocheLe: new Date() }).where(eq(paiement.id, paiementId));
}
