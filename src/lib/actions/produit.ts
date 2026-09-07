"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";

const schemaProduit = z.object({
  type: z.enum(["BIEN", "SERVICE"]),
  nom: z.string().trim().min(2, "Le nom est trop court."),
  description: z.string().trim().optional(),
  prixVente: z.coerce.number().int().nonnegative(),
  prixAchat: z.coerce.number().int().nonnegative(),
  suiviStock: z.coerce.boolean(),
  stockInitial: z.coerce.number().int().nonnegative().optional(),
});

export type EtatProduit = { erreur?: string } | null;

/**
 * Catalogue Produits/Tarifs (Items chez Zoho Books, échange du 2026-09-07)
 * — suiviStock n'a de sens que pour un BIEN (un SERVICE n'a jamais de
 * stock), imposé ici plutôt que laissé à la seule discipline du formulaire.
 */
export async function creerProduit(_etat: EtatProduit, formData: FormData): Promise<EtatProduit> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PRODUITS", "CREER")) {
    return { erreur: "Vous n'avez pas le droit de créer un produit." };
  }

  const analyse = schemaProduit.safeParse({
    type: formData.get("type") || "SERVICE",
    nom: formData.get("nom"),
    description: formData.get("description") || undefined,
    prixVente: formData.get("prixVente") || 0,
    prixAchat: formData.get("prixAchat") || 0,
    suiviStock: formData.get("suiviStock") === "on",
    stockInitial: formData.get("stockInitial") || 0,
  });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { type, nom, description, prixVente, prixAchat, suiviStock, stockInitial } = analyse.data;
  const suiviStockReel = type === "BIEN" && suiviStock;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.insert(produit).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      type,
      nom,
      description,
      prixVente,
      prixAchat,
      suiviStock: suiviStockReel,
      stockActuel: suiviStockReel ? (stockInitial ?? 0) : 0,
    })
  );

  revalidatePath("/app/produits");
  redirect("/app/produits");
}

export async function supprimerProduit(produitId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PRODUITS", "SUPPRIMER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(produit).where(eq(produit.id, produitId)));

  revalidatePath("/app/produits");
}
