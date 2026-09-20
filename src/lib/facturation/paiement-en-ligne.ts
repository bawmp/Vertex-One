import { eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { entreprise, facture, contact, tentativePaiementFacture } from "@/db/schema";
import { disponible } from "@/lib/plans";
import { initierPaiement } from "@/lib/cinetpay/client";

function urlBase(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * Crée une tentative de paiement CinetPay pour une facture et renvoie l'URL de
 * paiement (forfait Pro et au-dessus, identifiants CinetPay configurés). Partagée
 * entre le bouton interne « Payer en ligne » (src/lib/actions/facture.ts) et le
 * paiement par le client depuis son lien public (src/lib/actions/client-documents.ts).
 *
 * Une ligne tentativePaiementFacture est créée AVANT l'appel à CinetPay — son id
 * sert de transaction_id (jamais l'id de la Facture, transmis à un service externe
 * partagé entre entreprises clientes) et d'ancrage au webhook de notification.
 * Rappel CLAUDE.md : CinetPay est custodial avec délai de reversement — ne jamais
 * présenter ce paiement comme « instantané » ou « direct ».
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

  const [leContact] = laFacture.contactId ? await tx.select().from(contact).where(eq(contact.id, laFacture.contactId)) : [null];

  const [tentative] = await tx
    .insert(tentativePaiementFacture)
    .values({ entrepriseId: entrepriseId, factureId, montant: laFacture.montantTTC })
    .returning({ id: tentativePaiementFacture.id });

  const resultat = await initierPaiement({
    transactionId: tentative.id,
    montant: laFacture.montantTTC,
    description: `Facture ${laFacture.numero}`,
    notifyUrl: `${urlBase()}/api/paiements/cinetpay/notify`,
    returnUrl,
    clientNom: leContact?.nom ?? "Client",
    clientTelephone: leContact?.telephone ?? "",
    clientEmail: leContact?.email ?? null,
  });

  if (resultat.erreur) return { erreur: resultat.erreur };
  return { url: resultat.url };
}
