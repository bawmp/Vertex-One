"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, facture, paiement, avoirFacture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";

/**
 * Forfait Starter (docs/palier-1-*, section 6, étape 5) : le client paie
 * hors plateforme, l'utilisateur pointe lui-même le règlement — traçabilité
 * via saisiParId, jamais un paiement automatique anonyme.
 */
export async function marquerFacturePayee(factureId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") return;

    await tx.insert(paiement).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureId,
      montant: laFacture.montantTTC,
      moyenPaiement: "manuel",
      saisiParId: utilisateurConnecte.utilisateurId,
    });

    await tx.update(facture).set({ statut: "PAYEE" }).where(eq(facture.id, factureId));
  });

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
}

/**
 * Réservé à Manager/Administrateur (docs/palier-1-*, section 7) — un Employé
 * peut créer une facture mais ne l'annule pas seul. Jamais de suppression
 * (règle Palier 0) : l'AvoirFacture garde la trace, le numéro n'est jamais
 * réutilisé.
 */
export async function annulerFacture(factureId: string, motif: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(facture).where(eq(facture.id, factureId));
    if (!laFacture || laFacture.statut === "ANNULEE") return;

    await tx.insert(avoirFacture).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureId,
      motif: motif || "Non renseigné",
    });

    await tx.update(facture).set({ statut: "ANNULEE" }).where(eq(facture.id, factureId));
  });

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
}

/**
 * Forfait Pro et au-dessus (disponible("PAIEMENTS_EN_LIGNE")) : génère un
 * lien de paiement NotchPay — non branché tant que NOTCHPAY_PUBLIC_KEY/
 * NOTCHPAY_PRIVATE_KEY ne sont pas configurées (même traitement que Migadu
 * au Palier 0 : le contrôle d'accès est réel, l'intégration externe est
 * différée). Rappel CLAUDE.md : NotchPay est custodial avec délai de
 * reversement — ne jamais présenter ce lien comme un encaissement "direct".
 */
export async function genererLienPaiement(_factureId: string): Promise<{ url?: string; erreur?: string }> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  return avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "PAIEMENTS_EN_LIGNE")) {
      return { erreur: "Le paiement en ligne est disponible à partir du forfait Pro." };
    }
    if (!process.env.NOTCHPAY_PUBLIC_KEY) {
      return { erreur: "Intégration NotchPay non configurée pour le moment — utilisez l'encaissement manuel." };
    }

    // TODO Palier 1 : appel réel à l'API NotchPay (Collect) pour générer une
    // authorization_url, et enregistrer le webhook de confirmation.
    return { erreur: "Intégration NotchPay à finaliser." };
  });
}
