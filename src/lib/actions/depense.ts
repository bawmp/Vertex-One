"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { depense, compteComptable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { calculerMontants } from "@/lib/facturation/calcul";
import { genererEcrituresDepense } from "@/lib/comptabilite/ecritures";

const schemaDepense = z.object({
  libelle: z.string().trim().min(2, "Le libellé est trop court."),
  compteComptableId: z.string().trim().min(1, "Choisissez une catégorie de charge."),
  fournisseurId: z.string().trim().optional(),
  montantHT: z.coerce.number().int().positive("Le montant doit être positif."),
  tauxTVA: z.coerce.number().min(0).max(100),
  moyenPaiement: z.enum(["orange_money", "mtn_momo", "especes", "virement", "manuel"]),
  refacturable: z.coerce.boolean(),
  dealId: z.string().trim().optional(),
  datePaiement: z.string().trim().min(1, "La date est obligatoire."),
});

export type EtatDepense = { erreur?: string } | null;

/**
 * Saisie rapide d'une Dépense (échange du 2026-09-06, cycle Achats — "hors
 * cycle bill complet" selon la doc Zoho Books) : génère immédiatement ses
 * écritures comptables, comme une Facture émise (Palier 4).
 */
export async function creerDepense(_etat: EtatDepense, formData: FormData): Promise<EtatDepense> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "ACHATS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit d'enregistrer une dépense." };
  }

  const analyse = schemaDepense.safeParse({
    libelle: formData.get("libelle"),
    compteComptableId: formData.get("compteComptableId"),
    fournisseurId: formData.get("fournisseurId") || undefined,
    montantHT: formData.get("montantHT"),
    tauxTVA: formData.get("tauxTVA") || 0,
    moyenPaiement: formData.get("moyenPaiement"),
    refacturable: formData.get("refacturable") === "on",
    dealId: formData.get("dealId") || undefined,
    datePaiement: formData.get("datePaiement"),
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { libelle, compteComptableId, fournisseurId, montantHT, tauxTVA, moyenPaiement, refacturable, dealId, datePaiement } = analyse.data;
  const { montantTVA, montantTTC } = calculerMontants([{ quantite: 1, prixUnitaire: montantHT, tauxTVA }]);

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [uneLigne] = await tx.select({ nom: compteComptable.numero }).from(compteComptable).where(eq(compteComptable.id, compteComptableId));
    if (!uneLigne) throw new Error("Catégorie de charge introuvable.");

    const [laDepense] = await tx
      .insert(depense)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        libelle,
        compteComptableId,
        fournisseurId,
        montantHT,
        montantTVA,
        montantTTC,
        moyenPaiement,
        refacturable: refacturable && !!dealId,
        dealId: refacturable ? dealId : undefined,
        datePaiement: new Date(datePaiement),
        assigneAId: utilisateurConnecte.utilisateurId,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: depense.id });

    await genererEcrituresDepense(tx, {
      id: laDepense.id,
      entrepriseId: utilisateurConnecte.entrepriseId,
      libelle,
      compteComptableId,
      montantHT,
      montantTVA,
      montantTTC,
      moyenPaiement,
      datePaiement: new Date(datePaiement),
    });
  });

  revalidatePath("/app/achats");
  return null;
}
