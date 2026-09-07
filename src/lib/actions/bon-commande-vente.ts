"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { bonCommandeVente, ligneBonCommandeVente, facture, ligneFacture, deal, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroBonCommandeVente, genererNumeroFacture } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureEmise } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

const CHEMIN = "/app/facturation";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatBonCommandeVente = { erreur?: string } | null;

/**
 * Extensions Ventes (échange du 2026-09-07) — chemin alternatif additif au
 * Devis, aucune écriture comptable ni mouvement de stock ici (engagement,
 * pas encore une vente réalisée — voir schema.ts). Même vérification NIU
 * que creerDevis() : ce document mène directement à une Facture, jamais
 * sans NIU renseigné (docs/palier-1-*, section 2).
 */
export async function creerBonCommandeVente(_etat: EtatBonCommandeVente, formData: FormData): Promise<EtatBonCommandeVente> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un bon de commande." };
  }

  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return { erreur: "Formulaire invalide." };

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    produitId: formData.getAll("produitId")[i] || undefined,
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));
  const analyseLignes = z.array(schemaLigne).min(1, "Au moins une ligne est requise.").safeParse(lignesBrutes);
  if (!analyseLignes.success) {
    return { erreur: analyseLignes.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauBCV] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const numero = await genererNumeroBonCommandeVente(tx, utilisateurConnecte.entrepriseId);

    const [bc] = await tx
      .insert(bonCommandeVente)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: bonCommandeVente.id });

    await tx.insert(ligneBonCommandeVente).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        bonCommandeVenteId: bc.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [bc];
  }).catch((erreur) => {
    if (erreur instanceof Error && erreur.message === "NIU_MANQUANT") return [];
    throw erreur;
  });

  if (!nouveauBCV) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales)." };
  }

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Convertit un Bon de commande client en Facture, copie les lignes (comme
 * accepterDevis() côté Devis) — génère écritures + mouvement de stock, comme
 * toute Facture émise. Un Bon de commande déjà converti ou annulé ne peut
 * pas être reconverti.
 */
export async function convertirBonCommandeVenteEnFacture(bonCommandeVenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const dealId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leBCV] = await tx.select().from(bonCommandeVente).where(eq(bonCommandeVente.id, bonCommandeVenteId));
    if (!leBCV || leBCV.statut !== "BROUILLON") return null;

    const [lignesBCV, [leDeal]] = await Promise.all([
      tx.select().from(ligneBonCommandeVente).where(eq(ligneBonCommandeVente.bonCommandeVenteId, bonCommandeVenteId)),
      tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, leBCV.dealId)),
    ]);
    if (!leDeal) return null;

    const numero = await genererNumeroFacture(tx, utilisateurConnecte.entrepriseId);
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const [nouvelleFacture] = await tx
      .insert(facture)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId: leBCV.dealId,
        montantHT: leBCV.montantHT,
        montantTVA: leBCV.montantTVA,
        montantTTC: leBCV.montantTTC,
        dateEcheance,
      })
      .returning({ id: facture.id });

    await tx.insert(ligneFacture).values(
      lignesBCV.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId: nouvelleFacture.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await decrementerStockVente(tx, lignesBCV);

    await tx
      .update(bonCommandeVente)
      .set({ statut: "FACTURE", factureId: nouvelleFacture.id })
      .where(eq(bonCommandeVente.id, bonCommandeVenteId));

    await genererEcrituresFactureEmise(tx, {
      id: nouvelleFacture.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      dateEmission: new Date(),
      montantHT: leBCV.montantHT,
      montantTVA: leBCV.montantTVA,
      montantTTC: leBCV.montantTTC,
    });

    return leBCV.dealId;
  });

  revalidatePath(CHEMIN);
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
}

export async function annulerBonCommandeVente(bonCommandeVenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const dealId = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leBCV] = await tx
      .update(bonCommandeVente)
      .set({ statut: "ANNULE" })
      .where(and(eq(bonCommandeVente.id, bonCommandeVenteId), eq(bonCommandeVente.statut, "BROUILLON")))
      .returning({ dealId: bonCommandeVente.dealId });
    return leBCV?.dealId ?? null;
  });

  revalidatePath(CHEMIN);
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
}
