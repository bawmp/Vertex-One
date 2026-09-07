"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { factureFournisseur, ligneFactureFournisseur, paiementEffectue, avoirFournisseur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererEcrituresFactureFournisseur, genererEcrituresPaiementEffectue } from "@/lib/comptabilite/ecritures";

const CHEMIN = "/app/achats";

const schemaLigne = z.object({
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatFactureFournisseur = { erreur?: string } | null;

/**
 * Cycle Achats, deuxième tranche (échange du 2026-09-07) — le numéro est
 * celui DU FOURNISSEUR (texte libre), jamais généré par nous, contrairement
 * à Facture (client). Génère immédiatement ses écritures comptables, comme
 * Facture émise.
 */
export async function creerFactureFournisseur(_etat: EtatFactureFournisseur, formData: FormData): Promise<EtatFactureFournisseur> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer une facture fournisseur." };
  }

  const numero = String(formData.get("numero") ?? "").trim();
  const fournisseurId = String(formData.get("fournisseurId") ?? "");
  const compteComptableId = String(formData.get("compteComptableId") ?? "");
  const dateFacture = String(formData.get("dateFacture") ?? "");
  const dateEcheance = String(formData.get("dateEcheance") ?? "");

  if (!numero || !fournisseurId || !compteComptableId || !dateFacture || !dateEcheance) {
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
    const [nouvelleFacture] = await tx
      .insert(factureFournisseur)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        fournisseurId,
        compteComptableId,
        dateFacture: new Date(dateFacture),
        dateEcheance: new Date(dateEcheance),
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        assigneAId: utilisateurConnecte.utilisateurId,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: factureFournisseur.id });

    await tx.insert(ligneFactureFournisseur).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureFournisseurId: nouvelleFacture.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    await genererEcrituresFactureFournisseur(tx, {
      id: nouvelleFacture.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      numero,
      compteComptableId,
      dateFacture: new Date(dateFacture),
      montantHT: montants.montantHT,
      montantTVA: montants.montantTVA,
      montantTTC: montants.montantTTC,
    });
  });

  revalidatePath(CHEMIN);
  redirect(CHEMIN);
}

/**
 * Règlement intégral en une fois (même simplification que
 * marquerFacturePayee() côté client — voir schema.ts).
 */
export async function marquerFactureFournisseurPayee(factureFournisseurId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(factureFournisseur).where(eq(factureFournisseur.id, factureFournisseurId));
    if (!laFacture || laFacture.statut === "PAYEE" || laFacture.statut === "ANNULEE") return;

    const datePaiement = new Date();
    const [nouveauPaiement] = await tx
      .insert(paiementEffectue)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureFournisseurId,
        montant: laFacture.montantTTC,
        moyenPaiement: "manuel",
        datePaiement,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: paiementEffectue.id });

    await tx.update(factureFournisseur).set({ statut: "PAYEE" }).where(eq(factureFournisseur.id, factureFournisseurId));

    await genererEcrituresPaiementEffectue(tx, {
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureFournisseurId,
      paiementEffectueId: nouveauPaiement.id,
      numeroFactureFournisseur: laFacture.numero,
      montant: laFacture.montantTTC,
      moyenPaiement: "manuel",
      datePaiement,
    });
  });

  revalidatePath(CHEMIN);
}

/**
 * Avoir fournisseur (Vendor Credit) — miroir exact de annulerFacture() côté
 * client, même simplification assumée (pas de contre-passation des
 * écritures d'origine, voir schema.ts).
 */
export async function annulerFactureFournisseur(factureFournisseurId: string, motif: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [laFacture] = await tx.select().from(factureFournisseur).where(eq(factureFournisseur.id, factureFournisseurId));
    if (!laFacture || laFacture.statut === "ANNULEE") return;

    await tx.insert(avoirFournisseur).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      factureFournisseurId,
      motif: motif || "Non renseigné",
    });

    await tx.update(factureFournisseur).set({ statut: "ANNULEE" }).where(eq(factureFournisseur.id, factureFournisseurId));
  });

  revalidatePath(CHEMIN);
}
