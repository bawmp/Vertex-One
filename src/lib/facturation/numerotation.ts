import { sql, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise } from "@/db/schema";

/**
 * Numérotation séquentielle sans trou (docs/palier-1-*, section 5) — le
 * point de contrôle fiscal le plus strict de ce palier. Deux règles :
 *
 * 1. Le numéro n'est généré qu'au moment exact de l'émission (jamais à la
 *    création d'un brouillon).
 * 2. L'incrémentation et la lecture de la nouvelle valeur sont une seule
 *    opération atomique — jamais "lire puis écrire" en deux temps, qui
 *    laisserait deux requêtes concurrentes lire la même valeur.
 *
 * D'où la signature : ces fonctions prennent la transaction `tx` ouverte par
 * avecEntreprise() plutôt que d'en ouvrir une nouvelle — l'incrémentation du
 * compteur et l'insertion du devis/de la facture doivent réussir ou échouer
 * ensemble (si l'insertion échoue après incrémentation, le rollback de toute
 * la transaction annule aussi l'incrémentation, donc aucun trou).
 *
 * `UPDATE ... RETURNING` sur une seule ligne est atomique en Postgres au
 * niveau ligne : deux transactions concurrentes qui l'exécutent sur la même
 * entreprise sont sérialisées par le verrou de ligne — jamais deux
 * incréments simultanés ne peuvent lire la même valeur de départ.
 */
async function incrementerCompteur(
  tx: TransactionDrizzle,
  entrepriseId: string,
  colonne: "compteurDevis" | "compteurFactures"
): Promise<number> {
  const [ligne] = await tx
    .update(entreprise)
    .set({ [colonne]: sql`${entreprise[colonne]} + 1` })
    .where(eq(entreprise.id, entrepriseId))
    .returning({ compteur: entreprise[colonne] });

  return ligne.compteur;
}

export async function genererNumeroDevis(tx: TransactionDrizzle, entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const compteur = await incrementerCompteur(tx, entrepriseId, "compteurDevis");
  return `DEV-${annee}-${String(compteur).padStart(6, "0")}`;
}

export async function genererNumeroFacture(tx: TransactionDrizzle, entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const compteur = await incrementerCompteur(tx, entrepriseId, "compteurFactures");
  return `FAC-${annee}-${String(compteur).padStart(6, "0")}`;
}
