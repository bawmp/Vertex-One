import "server-only";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, facture, paiement, tentativePaiementAbonnement, tentativePaiementFacture } from "@/db/schema";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";
import { genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";
import { moyenPaiementDepuisOperateur, verifierTransaction, type ResultatVerification } from "@/lib/campay/client";
import { lireReferenceExterne, signatureValide } from "@/lib/campay/utilitaires";

export type IssueNotification = { code: number; message: string };

/**
 * Traite une notification CamPay (route publique, sans session, appelée par les serveurs de CamPay).
 *
 * Rien de ce qui arrive dans la requête n'est cru : seule la référence CamPay sert à savoir QUOI vérifier, puis la transaction
 * est relue serveur-à-serveur (statut, montant, référence externe). Une signature présente mais invalide écarte l'appel avant
 * tout appel au prestataire ; une signature absente n'empêche pas le traitement (la relecture reste la seule source de vérité).
 *
 * Idempotent : CamPay peut rappeler plusieurs fois pour une même transaction — une tentative n'est confirmée qu'une fois.
 */
export async function traiterNotificationCampay(entree: { reference: string | null; signature: string | null }): Promise<IssueNotification> {
  if (!entree.reference) return { code: 400, message: "reference manquante" };
  if (entree.signature && !signatureValide(entree.signature, process.env.CAMPAY_WEBHOOK_KEY)) {
    return { code: 401, message: "signature invalide" };
  }

  const verification = await verifierTransaction(entree.reference);
  // Prestataire injoignable : un code d'erreur fait rappeler CamPay plus tard, au lieu de perdre le paiement.
  if (verification.indisponible) return { code: 503, message: "vérification indisponible" };

  const cible = lireReferenceExterne(verification.referenceExterne);
  if (!cible) return { code: 404, message: "transaction inconnue" };

  if (cible.nature === "FACTURE") await confirmerTentativeFacture(cible.id, verification);
  else await confirmerTentativeAbonnement(cible.id, verification);
  return { code: 200, message: "OK" };
}

/** Le montant payé chez le prestataire doit être celui de la tentative : un écart n'est jamais confirmé. */
function montantConforme(verification: ResultatVerification, montantAttendu: number): boolean {
  return verification.montant === undefined || verification.montant === montantAttendu;
}

async function confirmerTentativeFacture(idTentative: string, verification: ResultatVerification) {
  // Lecture anonyme (aucune session) — n'aboutit que grâce à la policy RLS de lecture permissive dédiée à cette table quand
  // app.entreprise_id n'est pas positionné (même patron que `invitation`, voir src/db/schema.ts).
  const [anonyme] = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
  if (!anonyme) return;
  const entrepriseId = anonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, idTentative));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED") {
      await tx.update(tentativePaiementFacture).set({ statut: "ECHEC" }).where(eq(tentativePaiementFacture.id, idTentative));
      return;
    }
    if (verification.statut !== "ACCEPTED") return; // PENDING/INCONNU — CamPay rappellera
    if (!montantConforme(verification, tentative.montant)) {
      console.error(`[campay] montant inattendu pour la tentative ${idTentative} : ${verification.montant} au lieu de ${tentative.montant}`);
      return;
    }

    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, tentative.factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
      // Déjà réglée par un autre moyen entre-temps (pointage manuel) — tentative marquée confirmée, sans dupliquer le paiement.
      await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementFacture.id, idTentative));
      return;
    }

    const moyenPaiement = moyenPaiementDepuisOperateur(verification.operateur);
    const datePaiement = new Date();

    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({ entrepriseId, factureId: tentative.factureId, montant: tentative.montant, moyenPaiement, referenceTransaction: idTentative, datePaiement })
      .returning({ id: paiement.id });

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, tentative.factureId));
    await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: datePaiement }).where(eq(tentativePaiementFacture.id, idTentative));

    await genererEcrituresPaiement(tx, {
      entrepriseId,
      factureId: tentative.factureId,
      paiementId: nouveauPaiement.id,
      numeroFacture: laFacture.numero,
      montant: tentative.montant,
      moyenPaiement,
      datePaiement,
    });
  });
}

async function confirmerTentativeAbonnement(idTentative: string, verification: ResultatVerification) {
  const [anonyme] = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
  if (!anonyme) return;
  const entrepriseId = anonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, idTentative));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED") {
      await tx.update(tentativePaiementAbonnement).set({ statut: "ECHEC" }).where(eq(tentativePaiementAbonnement.id, idTentative));
      return;
    }
    if (verification.statut !== "ACCEPTED") return;
    if (!montantConforme(verification, tentative.montant)) {
      console.error(`[campay] montant inattendu pour l'abonnement ${idTentative} : ${verification.montant} au lieu de ${tentative.montant}`);
      return;
    }

    const [monEntreprise] = await tx.select({ abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!monEntreprise) return;

    const nouvelleEcheance = prochaineEcheanceApresPaiement(monEntreprise.abonnementEcheanceLe, new Date());

    // statutAbonnement repasse à "actif" immédiatement — un tenant suspendu retrouve l'accès à l'instant où le paiement est
    // confirmé, pas le lendemain via la vérification planifiée. dernierRappelAbonnementEnvoye remis à null pour repartir
    // propre sur le nouveau cycle.
    await tx
      .update(entreprise)
      .set({ abonnementEcheanceLe: nouvelleEcheance, statutAbonnement: "actif", dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.update(tentativePaiementAbonnement).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementAbonnement.id, idTentative));
  });
}
