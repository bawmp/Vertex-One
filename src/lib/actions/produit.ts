"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { televerserDocument, effacerObjetStockage } from "@/lib/documents/stockage";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const schemaProduit = z.object({
  type: z.enum(["BIEN", "SERVICE"]),
  nom: z.string().trim().min(2, m("Le nom est trop court.")),
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
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "CREER")) {
    return { erreur: t("Vous n'avez pas le droit de créer un produit.") };
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
    return { erreur: analyse.error.issues[0]?.message ?? t("Formulaire invalide.") };
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
      creeParId: utilisateurConnecte.utilisateurId,
    })
  );

  revalidatePath("/app/produits");
  redirect("/app/produits");
}

const schemaModificationProduit = z.object({
  nom: z.string().trim().min(2, m("Le nom est trop court.")),
  description: z.string().trim().optional(),
  prixVente: z.coerce.number(m("Le prix de vente doit être un nombre.")).int(m("Le prix de vente doit être un nombre entier.")).nonnegative(m("Le prix de vente ne peut pas être négatif.")),
  prixAchat: z.coerce.number(m("Le prix d'achat doit être un nombre.")).int(m("Le prix d'achat doit être un nombre entier.")).nonnegative(m("Le prix d'achat ne peut pas être négatif.")),
});

/**
 * Modifie un produit ou service déjà créé (nom, description, prix de vente et d'achat). Le TYPE (bien ou service) reste
 * figé et le stock n'est jamais touché ici : les ventes et achats le font évoluer, et changer le type casserait le suivi.
 * Les devis, factures et autres documents déjà établis gardent leur désignation et leur prix (copiés sur chaque ligne) :
 * seuls les prochains documents reprennent les nouvelles valeurs. Le produit est cherché AVEC l'entreprise de la session.
 */
export async function modifierProduit(produitId: string, _etat: EtatProduit, formData: FormData): Promise<EtatProduit> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier ce produit.") };
  }

  const analyse = schemaModificationProduit.safeParse({
    nom: formData.get("nom"),
    description: formData.get("description") || undefined,
    prixVente: formData.get("prixVente") || 0,
    prixAchat: formData.get("prixAchat") || 0,
  });
  if (!analyse.success) {
    return { erreur: t(analyse.error.issues[0]?.message ?? m("Formulaire invalide.")) };
  }
  const { nom, description, prixVente, prixAchat } = analyse.data;

  const modifies = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .update(produit)
      .set({ nom, description: description || null, prixVente, prixAchat })
      .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, utilisateurConnecte.entrepriseId)))
      .returning({ id: produit.id })
  );
  if (modifies.length === 0) return { erreur: t("Produit introuvable.") };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  return null;
}

export type EtatImageProduit = { erreur?: string } | null;

/**
 * Fiche détail Produit (échange du 2026-09-08) — même flux que
 * ajouterDocument() (src/lib/actions/document.ts) : upload direct serveur
 * via Buffer, jamais de presigned URL côté client. L'ancien objet R2 est
 * effacé après le succès du nouveau televersement, jamais laissé orphelin.
 */
export async function televerserImageProduit(produitId: string, _etat: EtatImageProduit, formData: FormData): Promise<EtatImageProduit> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier ce produit.") };
  }

  const fichier = formData.get("image");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: t("Sélectionnez une image.") };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserDocument({
    entrepriseId: utilisateurConnecte.entrepriseId,
    nomFichier: fichier.name,
    typeMime: fichier.type || "application/octet-stream",
    contenu,
  });
  if (!televerse) {
    return { erreur: erreur ?? t("Échec du téléversement.") };
  }

  const ancienneCle = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [avant] = await tx.select({ imageCleStockage: produit.imageCleStockage }).from(produit).where(eq(produit.id, produitId));
    await tx
      .update(produit)
      .set({ imageCleStockage: cleStockage, imageTypeMime: fichier.type || "application/octet-stream" })
      .where(eq(produit.id, produitId));
    return avant?.imageCleStockage ?? null;
  });
  if (ancienneCle) await effacerObjetStockage(ancienneCle);

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  return null;
}

export async function supprimerProduit(produitId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "SUPPRIMER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.delete(produit).where(eq(produit.id, produitId)));

  revalidatePath("/app/produits");
}
