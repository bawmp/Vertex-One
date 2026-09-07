"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { bonCommandeAchat, ligneBonCommandeAchat, factureFournisseur, ligneFactureFournisseur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroBonCommandeAchat } from "@/lib/facturation/numerotation";
import { genererEcrituresFactureFournisseur } from "@/lib/comptabilite/ecritures";

const CHEMIN = "/app/achats";

const schemaLigne = z.object({
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatBonCommandeAchat = { erreur?: string } | null;

/**
 * Cycle Achats, troisième tranche (échange du 2026-09-07) — un engagement
 * d'achat, aucune écriture comptable générée ici (hors bilan tant que non
 * facturé, voir schema.ts).
 */
export async function creerBonCommandeAchat(_etat: EtatBonCommandeAchat, formData: FormData): Promise<EtatBonCommandeAchat> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un bon de commande." };
  }

  const fournisseurId = String(formData.get("fournisseurId") ?? "");
  const compteComptableId = String(formData.get("compteComptableId") ?? "");
  if (!fournisseurId || !compteComptableId) {
    return { erreur: "Formulaire invalide." };
  }

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
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

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const numero = await genererNumeroBonCommandeAchat(tx, utilisateurConnecte.entrepriseId);

    const [nouveauBC] = await tx
      .insert(bonCommandeAchat)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        fournisseurId,
        compteComptableId,
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        assigneAId: utilisateurConnecte.utilisateurId,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: bonCommandeAchat.id });

    await tx.insert(ligneBonCommandeAchat).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        bonCommandeAchatId: nouveauBC.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );
  });

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Convertit un Bon de commande en Facture fournisseur à réception de la
 * facture réelle — copie les lignes plutôt que de les ressaisir, comme
 * accepterDevis() côté Ventes. Un Bon de commande déjà converti ou annulé
 * ne peut pas être reconverti (pas de facture fournisseur fantôme).
 */
export async function convertirBonCommandeEnFactureFournisseur(bonCommandeAchatId: string, numeroFactureFournisseur: string, dateEcheance: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) return;
  if (!numeroFactureFournisseur.trim() || !dateEcheance) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leBC] = await tx.select().from(bonCommandeAchat).where(eq(bonCommandeAchat.id, bonCommandeAchatId));
    if (!leBC || leBC.statut !== "BROUILLON") return;

    const lignesBC = await tx.select().from(ligneBonCommandeAchat).where(eq(ligneBonCommandeAchat.bonCommandeAchatId, bonCommandeAchatId));

    const [nouvelleFacture] = await tx
      .insert(factureFournisseur)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero: numeroFactureFournisseur.trim(),
        fournisseurId: leBC.fournisseurId,
        compteComptableId: leBC.compteComptableId,
        dateFacture: new Date(),
        dateEcheance: new Date(dateEcheance),
        montantHT: leBC.montantHT,
        montantTVA: leBC.montantTVA,
        montantTTC: leBC.montantTTC,
        assigneAId: leBC.assigneAId,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: factureFournisseur.id });

    await tx.insert(ligneFactureFournisseur).values(
      lignesBC.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureFournisseurId: nouvelleFacture.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await tx
      .update(bonCommandeAchat)
      .set({ statut: "FACTURE", factureFournisseurId: nouvelleFacture.id })
      .where(eq(bonCommandeAchat.id, bonCommandeAchatId));

    await genererEcrituresFactureFournisseur(tx, {
      id: nouvelleFacture.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero: numeroFactureFournisseur.trim(),
      compteComptableId: leBC.compteComptableId,
      dateFacture: new Date(),
      montantHT: leBC.montantHT,
      montantTVA: leBC.montantTVA,
      montantTTC: leBC.montantTTC,
    });
  });

  revalidatePath(CHEMIN);
}

export async function annulerBonCommandeAchat(bonCommandeAchatId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(bonCommandeAchat)
      .set({ statut: "ANNULE" })
      .where(and(eq(bonCommandeAchat.id, bonCommandeAchatId), eq(bonCommandeAchat.statut, "BROUILLON")))
  );

  revalidatePath(CHEMIN);
}
