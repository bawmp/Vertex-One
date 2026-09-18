import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { entreprise, tentativePaiementAbonnement } from "@/db/schema";
import { verifierTransaction } from "@/lib/cinetpay/client";
import { prochaineEcheanceApresPaiement } from "@/lib/abonnement/etat";

/**
 * Webhook public CinetPay pour l'abonnement plateforme — même squelette que
 * src/app/api/paiements/cinetpay/notify/route.ts (webhook facture), mais un
 * flux d'argent différent (le tenant paie Vertex One, pas un de ses propres
 * clients) : route et table séparées plutôt qu'un webhook générique à
 * discriminant.
 *
 * merchant_transaction_id (= tentativePaiementAbonnement.id) est retrouvé
 * par une lecture anonyme (policy RLS de lecture permissive dédiée, même
 * patron que `invitation` — voir src/db/schema.ts), puis la mise à jour
 * s'exécute dans avecEntreprise() une fois l'entrepriseId connu.
 *
 * CinetPay ne transmet jamais le statut réel dans la notification elle-même
 * (mesure anti man-in-the-middle documentée par CinetPay) — verifierTransaction()
 * (appel serveur-à-serveur avec nos propres identifiants) est la seule
 * source de vérité. Idempotent : CinetPay peut appeler cette URL plusieurs
 * fois pour la même transaction.
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

  const [tentativeAnonyme] = await db.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, transactionId));
  if (!tentativeAnonyme) return new NextResponse("Transaction inconnue", { status: 404 });

  const verification = await verifierTransaction(transactionId);
  const entrepriseId = tentativeAnonyme.entrepriseId;

  await avecEntreprise(entrepriseId, async (tx) => {
    const [tentative] = await tx.select().from(tentativePaiementAbonnement).where(eq(tentativePaiementAbonnement.id, transactionId));
    if (!tentative || tentative.statut === "CONFIRME") return;

    if (verification.statut === "REFUSED" || verification.statut === "CANCELLED") {
      await tx.update(tentativePaiementAbonnement).set({ statut: "ECHEC" }).where(eq(tentativePaiementAbonnement.id, transactionId));
      return;
    }

    if (verification.statut !== "ACCEPTED") return; // PENDING/INCONNU — CinetPay rappellera

    const [monEntreprise] = await tx.select({ abonnementEcheanceLe: entreprise.abonnementEcheanceLe }).from(entreprise).where(eq(entreprise.id, entrepriseId));
    if (!monEntreprise) return;

    const nouvelleEcheance = prochaineEcheanceApresPaiement(monEntreprise.abonnementEcheanceLe, new Date());

    // statutAbonnement repasse à "actif" immédiatement — un tenant suspendu
    // retrouve l'accès à l'instant où le paiement est confirmé, pas le
    // lendemain via la vérification planifiée. dernierRappelAbonnementEnvoye
    // remis à null pour repartir propre sur le nouveau cycle.
    await tx
      .update(entreprise)
      .set({ abonnementEcheanceLe: nouvelleEcheance, statutAbonnement: "actif", dernierRappelAbonnementEnvoye: null })
      .where(eq(entreprise.id, entrepriseId));
    await tx.update(tentativePaiementAbonnement).set({ statut: "CONFIRME", confirmeLe: new Date() }).where(eq(tentativePaiementAbonnement.id, transactionId));
  });

  return new NextResponse("OK", { status: 200 });
}
