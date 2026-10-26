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
import { getT } from "@/lib/i18n/langue";

export type EtatBranding = { erreur?: string } | null;

/**
 * Personnalisation (échange du 2026-09-13) — réservé à l'Administrateur
 * (PARAMETRES/MODIFIER), même niveau que les informations légales. Upload
 * direct serveur (Buffer), même flux que televerserImageProduit()
 * (src/lib/actions/produit.ts) — jamais de presigned URL côté client.
 */
export async function televerserLogo(_etat: EtatBranding, formData: FormData): Promise<EtatBranding> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier l'identité visuelle de l'entreprise.") };
  }

  const fichier = formData.get("logo");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: t("Sélectionnez une image.") };
  }
  if (!fichier.type.startsWith("image/")) {
    return { erreur: t("Le logo doit être une image (PNG, JPG, SVG...).") };
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());
  const { televerse, cleStockage, erreur } = await televerserDocument({
    entrepriseId: utilisateurConnecte.entrepriseId,
    nomFichier: fichier.name,
    typeMime: fichier.type,
    contenu,
  });
  if (!televerse) {
    return { erreur: erreur ?? t("Échec du téléversement.") };
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
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier l'identité visuelle de l'entreprise.") };
  }

  const analyse = schemaCouleur.safeParse({ couleurMarque: formData.get("couleurMarque") });
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? t("Couleur invalide.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ couleurMarque: analyse.data.couleurMarque }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app", "layout");
  revalidatePath("/app/parametres");
  return null;
}

/**
 * Active ou désactive le logo en filigrane sur les PDF de vente de l'entreprise (devis, factures, bons de commande, reçus,
 * acomptes). Réservé à qui peut modifier les paramètres ; la valeur est un booléen strict, jamais prise telle quelle.
 */
export async function definirFiligraneDocuments(actif: boolean): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier l'identité visuelle de l'entreprise.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ filigraneDocuments: actif === true }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app/parametres");
  return null;
}

/**
 * Active ou désactive le paiement en plusieurs fois : quand il est actif, le client peut régler une facture par tranches de son choix
 * depuis son lien. Réservé à qui peut modifier les paramètres ; la valeur est un booléen strict, jamais prise telle quelle.
 */
export async function definirPaiementEnTranches(actif: boolean): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Vous n'avez pas le droit de modifier les réglages de paiement de l'entreprise.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ paiementEnTranches: actif === true }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app/parametres");
  return null;
}

/**
 * Les Managers voient les données de toute l'entreprise (et non plus seulement celles de leur équipe) sur les modules métier. Réservé à
 * l'Administrateur (droit de modifier les paramètres) ; la valeur est un booléen strict.
 */
export async function definirManagersVoientTout(actif: boolean): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) {
    return { erreur: t("Seul l'Administrateur peut modifier ce réglage.") };
  }

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.update(entreprise).set({ managersVoientTout: actif === true }).where(eq(entreprise.id, utilisateurConnecte.entrepriseId))
  );

  revalidatePath("/app", "layout");
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
