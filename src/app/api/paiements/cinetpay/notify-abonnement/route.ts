import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
import { verifierTransaction, analyserIdTransactionExterne } from "@/lib/cinetpay/client";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";

/**
 * Webhook public CinetPay pour l'abonnement plateforme — même squelette que
 * src/app/api/paiements/cinetpay/notify/route.ts (webhook facture), mais un
 * flux d'argent différent (le tenant paie Vertex One, pas un de ses propres
 * clients) : route et table séparées plutôt qu'un webhook générique à
 * discriminant.
 *
 * cpm_trans_id est préfixé par l'entrepriseId (idTransactionExterne(), même
 * patron que le prestataire de chat) — cette route ouvre donc avecEntreprise()
 * directement, sans lecture anonyme ni policy RLS dérogatoire.
 *
 * CinetPay ne transmet jamais le statut réel dans la notification elle-même
 * (mesure anti man-in-the-middle documentée par CinetPay) — verifierTransaction()
 * (appel serveur-à-serveur avec notre propre apikey) est la seule source de
 * vérité. Idempotent : CinetPay peut appeler cette URL plusieurs fois pour
 * la même transaction.
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
    const [tentative] = await tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, tentativeId));
    if (!tentative || tentative.statut === "CONFIRME") return Boolean(tentative);

    if (verification.statut === "REFUSED" || verification.statut === "CANCELLED") {
      await tx.update(tentativePaiementAbonnement).set({ statut: "ECHEC" }).where(eq(tentativePaiementAbonnement.id, tentativeId));
      return true;
    }

    if (verification.statut !== "ACCEPTED") return true; // PENDING/INCONNU — CinetPay rappellera

    const [monEntreprise] = await tx.select({ abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!monEntreprise) return true;

    const nouvelleEcheance = prochaineEcheanceApresPaiement(monEntreprise.abonnementEcheanceLe, new Date());

    // statutAbonnement repasse à "actif" immédiatement — un tenant suspendu
    // retrouve l'accès à l'instant où le paiement est confirmé, pas le
    // lendemain via la vérification planifiée. dernierRappelAbonnementEnvoye
    // remis à null pour repartir propre sur le nouveau cycle.
    await tx
      .update(entreprise)
      .set({ abonnementEcheanceLe: nouvelleEcheance, statutAbonnement: "actif", dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.update(tentativePaiementAbonnement).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementAbonnement.id, tentativeId));

    return true;
  });

  if (!trouvee) return new NextResponse("Transaction inconnue", { status: 404 });
  return new NextResponse("OK", { status: 200 });
}
