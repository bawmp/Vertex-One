"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recuVente, ligneRecuVente, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroRecuVente } from "@/lib/facturation/numerotation";
import { genererEcrituresRecuVente } from "@/lib/comptabilite/ecritures";
import { decrementerStockVente } from "@/lib/produits/stock";

const CHEMIN = "/app/facturation";

const schemaLigne = z.object({
  produitId: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatRecuVente = { erreur?: string } | null;

/**
 * Extensions Ventes, Reçus de vente (échange du 2026-09-07) — une vente au
 * comptant, encaissée intégralement à la création : contrairement à
 * creerDevis()/creerBonCommandeVente(), il n'y a pas d'état "brouillon", le
 * Reçu est immédiatement EMISE avec ses écritures et son mouvement de stock.
 * Même vérification NIU obligatoire : ce document est un document financier
 * définitif dès sa création, jamais sans NIU renseigné.
 */
export async function creerRecuVente(_etat: EtatRecuVente, formData: FormData): Promise<EtatRecuVente> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un reçu de vente." };
  }

  const dealId = String(formData.get("dealId") ?? "");
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "");
  const referenceTransaction = String(formData.get("referenceTransaction") ?? "").trim();
  if (!dealId) return { erreur: "Formulaire invalide." };
  if (!["orange_money", "mtn_momo", "especes", "virement", "manuel"].includes(moyenPaiement)) {
    return { erreur: "Moyen de paiement invalide." };
  }

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

  const [nouveauRecu] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const numero = await genererNumeroRecuVente(tx, utilisateurConnecte.entrepriseId);
    const dateEmission = new Date();

    const [recu] = await tx
      .insert(recuVente)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        dealId,
        dateEmission,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        moyenPaiement: moyenPaiement as "orange_money" | "mtn_momo" | "especes" | "virement" | "manuel",
        referenceTransaction: referenceTransaction || undefined,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: recuVente.id });

    await tx.insert(ligneRecuVente).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        recuVenteId: recu.id,
        produitId: l.produitId,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await decrementerStockVente(tx, lignes);

    await genererEcrituresRecuVente(tx, {
      id: recu.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      dateEmission,
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
      moyenPaiement,
    });

    return [recu];
  }).catch((erreur) => {
    if (erreur instanceof Error && erreur.message === "NIU_MANQUANT") return [];
    throw erreur;
  });

  if (!nouveauRecu) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales)." };
  }

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Comme annulerFacture()/annulerBonCommandeAchat() : aucune contre-passation
 * des écritures d'origine (simplification assumée dans tout ce module), le
 * Reçu reste consultable mais son statut passe à ANNULE.
 */
export async function annulerRecuVente(recuVenteId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(recuVente)
      .set({ statut: "ANNULE" })
      .where(and(eq(recuVente.id, recuVenteId), eq(recuVente.statut, "EMISE")))
  );

  revalidatePath(CHEMIN);
}
