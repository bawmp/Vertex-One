import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { tentativePaiementFacture, facture, paiement } from "@/db/schema";
import { verifierTransaction, moyenPaiementDepuisOperateur } from "@/lib/cinetpay/client";
import { genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";

/**
 * Webhook public CinetPay (notify_url) — route publique, sans session,
 * appelée directement par les serveurs de CinetPay. merchant_transaction_id
 * (= tentativePaiementFacture.id, voir genererLienPaiement() dans
 * src/lib/actions/facture.ts) est retrouvé par une lecture anonyme (policy
 * RLS de lecture permissive dédiée sur tentativePaiementFacture, même patron
 * que `invitation` — voir src/db/schema.ts), puis la mise à jour s'exécute
 * dans avecEntreprise() une fois l'entrepriseId connu.
 *
 * CinetPay ne transmet jamais le statut réel dans la notification elle-même
 * (mesure anti man-in-the-middle documentée par CinetPay) — le
 * merchant_transaction_id ne sert qu'à savoir QUOI vérifier ;
 * verifierTransaction() (appel serveur-à-serveur avec nos propres
 * identifiants) est la seule source de vérité sur le statut réel.
 *
 * Idempotent : CinetPay peut appeler cette URL plusieurs fois pour la même
 * transaction (documenté) — la ligne n'est confirmée qu'une seule fois
 * (double vérification du statut à l'intérieur de la transaction ouverte).
 */
export async function POST(request: Request) {
  let transactionId: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const corps = await request.json();
      transactionId = corps?.merchant_transaction_id ?? null;
    } else {
      const formData = await request.formData();
      transactionId = formData.get("merchant_transaction_id") as string | null;
    }
  } catch {
    return new NextResponse("Requête invalide", { status: 400 });
  }

  if (!transactionId) return new NextResponse("merchant_transaction_id manquant", { status: 400 });

  // Lecture anonyme (aucune session) — n'aboutit que grâce à la policy RLS
  // permissive dédiée à cette table quand app.entreprise_id n'est pas positionné.
  const [tentativeAnonyme] = await db.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, transactionId));
  if (!tentativeAnonyme) return new NextResponse("Transaction inconnue", { status: 404 });

  const verification = await verifierTransaction(transactionId);
  const entrepriseId = tentativeAnonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, transactionId));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED" || verification.statut === "CANCELLED") {
      await tx.update(tentativePaiementFacture).set({ statut: "ECHEC" }).where(eq(tentativePaiementFacture.id, transactionId));
      return;
    }

    if (verification.statut !== "ACCEPTED") return; // PENDING/INCONNU — CinetPay rappellera

    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, tentative.factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
      // Déjà réglée par un autre moyen entre-temps (pointage manuel) —
      // marquer la tentative confirmée sans dupliquer le paiement.
      await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementFacture.id, transactionId));
      return;
    }

    // L'API v1 de CinetPay (client.payment.getStatus()) ne renvoie plus
    // l'opérateur mobile money utilisé — voir moyenPaiementDepuisOperateur().
    const moyenPaiement = moyenPaiementDepuisOperateur(undefined);
    const datePaiement = new Date();

    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({
        entrepriseId,
        factureId: tentative.factureId,
        montant: tentative.montant,
        moyenPaiement,
        referenceTransaction: transactionId,
        datePaiement,
      })
      .returning({ id: paiement.id });

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, tentative.factureId));
    await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: datePaiement }).where(eq(tentativePaiementFacture.id, transactionId));

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

  return new NextResponse("OK", { status: 200 });
}
