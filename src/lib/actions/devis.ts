"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise, devis, ligneDevis, facture, ligneFacture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererNumeroDevis, genererNumeroFacture } from "@/lib/facturation/numerotation";

const schemaLigne = z.object({
  designation: z.string().trim().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().int().nonnegative(),
  tauxTVA: z.coerce.number().min(0).max(100),
});

export type EtatDevis = { erreur?: string } | null;

/**
 * Bloque la création tant que le NIU n'est pas renseigné (docs/palier-1-*,
 * section 2) — sans lui, aucun devis émis ne serait conforme DGI. Le numéro
 * n'est PAS généré ici : un devis reste un brouillon jusqu'à son envoi, et
 * la numérotation ne concerne que les factures (section 5). On donne quand
 * même un numéro de brouillon lisible ("DEV-2026-000042") dès la création
 * pour l'affichage — voir note dans le code : à distinguer du numéro de
 * FACTURE, seul soumis à la contrainte stricte de séquence sans trou.
 */
export async function creerDevis(_etat: EtatDevis, formData: FormData): Promise<EtatDevis> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un devis." };
  }

  const prospectId = String(formData.get("prospectId") ?? "");
  const dateValidite = String(formData.get("dateValidite") ?? "");

  const lignesBrutes = formData.getAll("designation").map((_, i) => ({
    designation: formData.getAll("designation")[i],
    quantite: formData.getAll("quantite")[i],
    prixUnitaire: formData.getAll("prixUnitaire")[i],
    tauxTVA: formData.getAll("tauxTVA")[i],
  }));

  const analyseLignes = z.array(schemaLigne).min(1, "Au moins une ligne est requise.").safeParse(lignesBrutes);
  if (!analyseLignes.success || !prospectId || !dateValidite) {
    return { erreur: analyseLignes.success ? "Formulaire invalide." : analyseLignes.error.issues[0]?.message };
  }

  const lignes = analyseLignes.data;
  const montants = calculerMontants(lignes);

  const [nouveauDevis] = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ niu: entreprise.niu }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise.niu) {
      throw new Error("NIU_MANQUANT");
    }

    const numero = await genererNumeroDevis(tx, utilisateurConnecte.entrepriseId);

    const [ligneDevisCree] = await tx
      .insert(devis)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        prospectId,
        dateValidite: new Date(dateValidite),
        montantHT: montants.montantHT,
        montantTVA: montants.montantTVA,
        montantTTC: montants.montantTTC,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: devis.id });

    await tx.insert(ligneDevis).values(
      lignes.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        devisId: ligneDevisCree.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    return [ligneDevisCree];
  }).catch((erreur) => {
    if (erreur instanceof Error && erreur.message === "NIU_MANQUANT") return [];
    throw erreur;
  });

  if (!nouveauDevis) {
    return { erreur: "Complétez d'abord le NIU de votre entreprise (Paramètres > Informations légales)." };
  }

  redirect(`/app/facturation/devis/${nouveauDevis.id}`);
}

/**
 * Devis accepté → facture créée automatiquement dans le même mouvement
 * (docs/palier-1-*, section 6, étape 4), numéro de facture généré à cet
 * instant précis (jamais avant) via genererNumeroFacture(), dans la même
 * transaction que l'insertion — un échec de l'insertion annule aussi
 * l'incrémentation du compteur, donc jamais de trou dans la séquence.
 */
export async function accepterDevis(devisId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  const idFactureCreee = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDevis] = await tx.select().from(devis).where(eq(devis.id, devisId));
    if (!leDevis || leDevis.statut === "ACCEPTE") return null;

    const lignesDuDevis = await tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, devisId));

    await tx.update(devis).set({ statut: "ACCEPTE" }).where(eq(devis.id, devisId));

    const numero = await genererNumeroFacture(tx, utilisateurConnecte.entrepriseId);
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const [nouvelleFacture] = await tx
      .insert(facture)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        numero,
        prospectId: leDevis.prospectId,
        devisOrigineId: leDevis.id,
        montantHT: leDevis.montantHT,
        montantTVA: leDevis.montantTVA,
        montantTTC: leDevis.montantTTC,
        dateEcheance,
      })
      .returning({ id: facture.id });

    await tx.insert(ligneFacture).values(
      lignesDuDevis.map((l) => ({
        entrepriseId: utilisateurConnecte.entrepriseId,
        factureId: nouvelleFacture.id,
        designation: l.designation,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        tauxTVA: l.tauxTVA,
      }))
    );

    // Point d'accroche pour le Palier 2 (ouverture Dossier/Projet à la
    // conversion d'un devis) — aucun listener pour l'instant, voir section 6.
    // événement : "devis.accepte", { devisId, factureId: nouvelleFacture.id }

    return nouvelleFacture.id;
  });

  revalidatePath(`/app/facturation/devis/${devisId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app");

  if (idFactureCreee) redirect(`/app/facturation/factures/${idFactureCreee}`);
}

export async function envoyerDevis(devisId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "FACTURATION", "MODIFIER")) return;

  // TODO Palier 1 : envoi réel par email (Resend) et WhatsApp (Meta Cloud
  // API) — différé faute de clés API configurées, comme Migadu au Palier 0.
  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(devis).set({ statut: "ENVOYE" }).where(eq(devis.id, devisId))
  );

  revalidatePath(`/app/facturation/devis/${devisId}`);
}
