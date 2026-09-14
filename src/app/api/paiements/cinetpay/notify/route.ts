import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { tentativePaiementFacture, facture, paiement } from "@/db/schema";
import { verifierTransaction, analyserIdTransactionExterne, moyenPaiementDepuisOperateur } from "@/lib/cinetpay/client";
import { genererEcrituresPaiement } from "@/lib/comptabilite/ecritures";

/**
 * Webhook public CinetPay (notify_url) — route publique, sans session,
 * appelée directement par les serveurs de CinetPay. cpm_trans_id
 * (transaction_id transmis à l'initiation, voir genererLienPaiement() dans
 * src/lib/actions/facture.ts) est préfixé par l'entrepriseId
 * (idTransactionExterne(), même patron que idExterneUtilisateur()/
 * idExterneCanal() pour le chat) : cette route peut donc ouvrir
 * avecEntreprise() directement, sans lecture anonyme ni policy RLS
 * dérogatoire.
 *
 * CinetPay ne transmet jamais le statut réel dans la notification elle-même
 * (mesure anti man-in-the-middle documentée par CinetPay) — cpm_trans_id ne
 * sert qu'à savoir QUOI vérifier ; verifierTransaction() (appel
 * serveur-à-serveur avec notre propre apikey) est la seule source de vérité
 * sur le statut réel.
 *
 * Idempotent : CinetPay peut appeler cette URL plusieurs fois pour la même
 * transaction (documenté) — la ligne n'est confirmée qu'une seule fois
 * (double vérification du statut à l'intérieur de la transaction ouverte).
 */
export async function POST(request: Request) {
  let transactionIdBrut: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const corps = await request.json();
      transactionIdBrut = corps?.cpm_trans_id ?? corps?.transaction_id ?? null;
    } else {
      const formData = await request.formData();
      transactionIdBrut = (formData.get("cpm_trans_id") as string | null) ?? (formData.get("transaction_id") as string | null);
    }
  } catch {
    return new NextResponse("Requête invalide", { status: 400 });
  }

  if (!transactionIdBrut) return new NextResponse("cpm_trans_id manquant", { status: 400 });

  const analyse = analyserIdTransactionExterne(transactionIdBrut);
  if (!analyse) return new NextResponse("transaction_id invalide", { status: 400 });
  const { entrepriseId, tentativeId } = analyse;

  const verification = await verifierTransaction(transactionIdBrut);

  const trouvee = await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementFacture).where(eq(tentativePaiementFacture.id, tentativeId));
    if (!tentative || tentative.statut === "CONFIRME") return Boolean(tentative);

    if (verification.statut === "REFUSED" || verification.statut === "CANCELLED") {
      await tx.update(tentativePaiementFacture).set({ statut: "ECHEC" }).where(eq(tentativePaiementFacture.id, tentativeId));
      return true;
    }

    if (verification.statut !== "ACCEPTED") return true; // PENDING/INCONNU — CinetPay rappellera

    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, tentative.factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
      // Déjà réglée par un autre moyen entre-temps (pointage manuel) —
      // marquer la tentative confirmée sans dupliquer le paiement.
      await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementFacture.id, tentativeId));
      return true;
    }

    const moyenPaiement = moyenPaiementDepuisOperateur(verification.operateur);
    const datePaiement = new Date();

    const [nouveauPaiement] = await tx
      .insert(paiement)
      .values({
        entrepriseId,
        factureId: tentative.factureId,
        montant: verification.montant ?? tentative.montant,
        moyenPaiement,
        referenceTransaction: transactionIdBrut,
        datePaiement,
      })
      .returning({ id: paiement.id });

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, tentative.factureId));
    await tx.update(tentativePaiementFacture).set({ statut: "CONFIRME", confirmeLe: datePaiement }).where(eq(tentativePaiementFacture.id, tentativeId));

    await genererEcrituresPaiement(tx, {
      entrepriseId,
      factureId: tentative.factureId,
      paiementId: nouveauPaiement.id,
      numeroFacture: laFacture.numero,
      montant: verification.montant ?? tentative.montant,
      moyenPaiement,
      datePaiement,
    });
    return true;
  });

  if (!trouvee) return new NextResponse("Transaction inconnue", { status: 404 });
  return new NextResponse("OK", { status: 200 });
}
