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
  colonne: "compteurDevis" | "compteurFactures" | "compteurBonsCommandeAchat" | "compteurBonsCommandeVente"
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

/**
 * Cycle Achats (échange du 2026-09-07) — NOTRE numéro (émis par nous vers le
 * fournisseur), contrairement à celui d'une Facture fournisseur qui est
 * saisi tel quel depuis le document du fournisseur.
 */
export async function genererNumeroBonCommandeAchat(tx: TransactionDrizzle, entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const compteur = await incrementerCompteur(tx, entrepriseId, "compteurBonsCommandeAchat");
  return `BC-${annee}-${String(compteur).padStart(6, "0")}`;
}

/**
 * Extensions Ventes (échange du 2026-09-07) — un Bon de commande client
 * (Sales Order) est, comme le Bon de commande fournisseur, NOTRE numéro,
 * avec un préfixe distinct ("BCV" plutôt que "BC") pour ne jamais confondre
 * les deux séries dans les échanges avec un client/fournisseur.
 */
export async function genererNumeroBonCommandeVente(tx: TransactionDrizzle, entrepriseId: string): Promise<string> {
  const annee = new Date().getFullYear();
  const compteur = await incrementerCompteur(tx, entrepriseId, "compteurBonsCommandeVente");
  return `BCV-${annee}-${String(compteur).padStart(6, "0")}`;
}
