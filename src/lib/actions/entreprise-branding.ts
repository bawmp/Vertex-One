"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { televerserDocument, effacerObjetStockage } from "@/lib/documents/stockage";
import { schemaCouleur } from "@/lib/branding";

export type EtatBranding = { erreur?: string } | null;

/**
 * Personnalisation (échange du 2026-09-13) — réservé à l'Administrateur
 * (PARAMETRES/MODIFIER), même niveau que les informations légales. Upload
 * direct serveur (Buffer), même flux que televerserImageProduit()
 * (src/lib/actions/produit.ts) — jamais de presigned URL côté client.
 */
export async function televerserLogo(_etat: EtatBranding, formData: FormData): Promise<EtatBranding> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier l'identité visuelle de l'entreprise." };
  }

  const fichier = formData.get("logo");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Sélectionnez une image." };
  }
  if (!fichier.type.startsWith("image/")) {
    return { erreur: "Le logo doit être une image (PNG, JPG, SVG...)." };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserDocument({
    entrepriseId: utilisateurConnecte.entrepriseId,
    nomFichier: fichier.name,
    typeMime: fichier.type,
    contenu,
  });
  if (!televerse) {
    return { erreur: erreur ?? "Échec du téléversement." };
  }

  const ancienneCle = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [avant] = await tx.select({ logoCleStockage: entreprise.logoCleStockage }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    await tx.update(entreprise).set({ logoCleStockage: cleStockage, logoTypeMime: fichier.type }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return avant?.logoCleStockage ?? null;
  });
  if (ancienneCle) await effacerObjetStockage(ancienneCle);

  revalidatePath("/app", "layout");
  revalidatePath("/app/parametres");
  return null;
}

export async function definirCouleurMarque(_etat: EtatBranding, formData: FormData): Promise<EtatBranding> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: "Vous n'avez pas le droit de modifier l'identité visuelle de l'entreprise." };
  }

  const analyse = schemaCouleur.safeParse({ couleurMarque: formData.get("couleurMarque") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? "Couleur invalide." };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ couleurMarque: analyse.data.couleurMarque }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app", "layout");
  revalidatePath("/app/parametres");
  return null;
}

export async function reinitialiserCouleurMarque() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (utilisateurConnecte.role !== "ADMIN") return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => tx.update(entreprise).set({ couleurMarque: null }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)));

  revalidatePath("/app", "layout");
  revalidatePath("/app/parametres");
}
