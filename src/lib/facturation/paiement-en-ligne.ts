import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, facture, tentativePaiementFacture } from "@/db/schema";
import { disponible } from "@/lib/plans";
import { initierPaiement } from "@/lib/campay/client";
import { referenceExterne } from "@/lib/campay/utilitaires";

/**
 * Crée une tentative de paiement CamPay pour une facture et renvoie l'URL de
 * paiement (forfait Pro et au-dessus, identifiants CamPay configurés). Partagée
 * entre le bouton interne « Payer en ligne » (src/lib/actions/facture.ts) et le
 * paiement par le client depuis son lien public (src/lib/actions/client-documents.ts).
 *
 * Une ligne tentativePaiementFacture est créée AVANT l'appel à CamPay — son id
 * (préfixé, voir referenceExterne()) sert de référence externe (jamais l'id de la Facture,
 * transmis à un service externe partagé entre entreprises clientes) et d'ancrage au webhook.
 * Rappel CLAUDE.md : le paiement Mobile Money n'est jamais présenté comme « instantané » ou « direct ».
 */
export async function creerLienPaiementFacture(
  tx: TransactionDrizzle,
  params: { entrepriseId: string; factureId: string; returnUrl: string }
): Promise<{ url?: string; erreur?: string }> {
  const { entrepriseId, factureId, returnUrl } = params;
  const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, entrepriseId));

  if (!disponible(monEntreprise, "PAIEMENTS_EN_LIGNE")) {
    return { erreur: "Le paiement en ligne est disponible à partir du forfait Pro." };
  }

  const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
  if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") {
    return { erreur: "Cette facture n'est plus en attente de règlement." };
  }

    const [tentative] = await tx
    .insert(tentativePaiementFacture)
    .values({ entrepriseId: entrepriseId, factureId, montant: laFacture.montantTTC })
    .returning({ id: tentativePaiementFacture.id });

  const resultat = await initierPaiement({
    reference: referenceExterne("FACTURE", tentative.id),
    montant: laFacture.montantTTC,
    description: `Facture ${laFacture.numero}`,
    returnUrl,
  });

  if (resultat.erreur) return { erreur: resultat.erreur };
  return { url: resultat.url };
}
