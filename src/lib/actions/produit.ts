"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { produit, mouvementStock } from "@/db/schema";
import { assurerDepotPrincipal, deplacerStockDepot } from "@/lib/produits/depots";
import { gestionStockActive, MESSAGE_STOCK_DESACTIVE } from "@/lib/produits/gestion-stock";
import { estComposant } from "@/lib/produits/kits";
import { activerSuiviStock, arreterSuiviStock, corrigerStock, definirSeuilAlerte, type CorrectionStock } from "@/lib/produits/stock";
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
  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // Une entreprise de services ne suit pas de stock : la case éventuellement envoyée par le navigateur est ignorée.
    const suiviStockReel = type === "BIEN" && suiviStock && (await gestionStockActive(tx, utilisateurConnecte.entrepriseId));
    const [cree] = await tx
      .insert(produit)
      .values({
        entrepriseId: utilisateurConnecte.entrepriseId,
        type,
        nom,
        description,
        prixVente,
        prixAchat,
        suiviStock: suiviStockReel,
        stockActuel: suiviStockReel ? (stockInitial ?? 0) : 0,
        coutMoyen: suiviStockReel ? prixAchat : 0,
        creeParId: utilisateurConnecte.utilisateurId,
      })
      .returning({ id: produit.id });
    // Le stock saisi à la création est le stock de départ : il ouvre l'historique du produit.
    if (suiviStockReel && (stockInitial ?? 0) > 0) {
      const principal = await assurerDepotPrincipal(tx, utilisateurConnecte.entrepriseId);
      await deplacerStockDepot(tx, utilisateurConnecte.entrepriseId, cree.id, principal.id, stockInitial!);
      await tx.insert(mouvementStock).values({ entrepriseId: utilisateurConnecte.entrepriseId, produitId: cree.id, type: "INITIAL", quantite: stockInitial!, stockApres: stockInitial!, depotId: principal.id, creeParId: utilisateurConnecte.utilisateurId });
    }
  });

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

  await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    // Un produit qui entre dans la composition d'un kit ne se supprime pas : le kit ne pourrait plus se vendre (priorité 3.9).
    if (await estComposant(tx, utilisateurConnecte.entrepriseId, produitId)) return;
    await tx.delete(produit).where(eq(produit.id, produitId));
  });

  revalidatePath("/app/produits");
}

export type EtatStock = { erreur?: string; message?: string } | null;

/**
 * Correction manuelle du stock d'un produit (entrée, sortie ou inventaire du produit) depuis sa fiche. Droit MODIFIER sur les
 * produits ; la quantité, le motif et le produit sont revérifiés ici, jamais crus tels que le navigateur les envoie.
 */
export async function corrigerStockProduit(produitId: string, _etat: EtatStock, formData: FormData): Promise<EtatStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const mode = String(formData.get("mode") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || undefined;
  let correction: CorrectionStock;
  if (mode === "INVENTAIRE") {
    correction = { mode, compte: Number(formData.get("quantite")), note, depotId: String(formData.get("depotId") ?? "") || undefined };
  } else if (mode === "AJOUT" || mode === "RETRAIT") {
    correction = { mode, quantite: Number(formData.get("quantite")), motif: String(formData.get("motif") ?? ""), note, depotId: String(formData.get("depotId") ?? "") || undefined };
  } else {
    return { erreur: t("Choisissez ce que vous voulez faire du stock.") };
  }

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ((await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? corrigerStock(tx, utilisateurConnecte.entrepriseId, produitId, correction, utilisateurConnecte.utilisateurId) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  if (resultat.ecart === 0) return { message: t("Le stock est déjà à {n}, rien à corriger.", { n: resultat.stockApres }) };
  return { message: t("Stock mis à jour : {avant} → {apres}.", { avant: resultat.stockAvant, apres: resultat.stockApres }) };
}

/** Active le suivi du stock d'un bien déjà créé, avec la quantité actuellement en rayon. */
export async function activerSuiviStockProduit(produitId: string, _etat: EtatStock, formData: FormData): Promise<EtatStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const quantite = Number(formData.get("quantite") || 0);
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ((await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? activerSuiviStock(tx, utilisateurConnecte.entrepriseId, produitId, quantite, utilisateurConnecte.utilisateurId) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  return { message: t("Le suivi du stock est activé : {n} en stock.", { n: resultat.stockApres }) };
}

/**
 * Inventaire de plusieurs produits d'un coup : un champ `compte_<id>` par produit, seuls les champs remplis comptent. Chaque écart
 * est enregistré séparément (ligne « inventaire » dans l'historique du produit). Un produit inconnu ou d'une autre entreprise est
 * refusé par `corrigerStock` (lecture sous RLS), sans bloquer les autres lignes.
 */
export async function enregistrerInventaire(_etat: EtatStock, formData: FormData): Promise<EtatStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const comptes: { produitId: string; compte: number }[] = [];
  for (const [cle, valeur] of formData.entries()) {
    if (!cle.startsWith("compte_")) continue;
    const texte = String(valeur).trim();
    if (texte === "") continue;
    comptes.push({ produitId: cle.slice("compte_".length), compte: Number(texte) });
  }
  if (comptes.length === 0) return { erreur: t("Saisissez au moins une quantité comptée.") };
  const depotId = String(formData.get("depotId") ?? "") || undefined;
  if (comptes.length > 500) return { erreur: t("Trop de produits d'un coup : enregistrez par groupes de 500 au plus.") };

  const bilan = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    let corriges = 0;
    let inchanges = 0;
    const refuses: string[] = [];
    if (!(await gestionStockActive(tx, utilisateurConnecte.entrepriseId))) return { corriges, inchanges, refuses: [MESSAGE_STOCK_DESACTIVE] };
    for (const { produitId, compte } of comptes) {
      const r = await corrigerStock(tx, utilisateurConnecte.entrepriseId, produitId, { mode: "INVENTAIRE", compte, note: undefined, depotId }, utilisateurConnecte.utilisateurId);
      if (!r.ok) refuses.push(r.erreur);
      else if (r.ecart === 0) inchanges++;
      else corriges++;
    }
    return { corriges, inchanges, refuses };
  });

  revalidatePath("/app/produits");
  if (bilan.refuses.length > 0) return { erreur: t("{n} ligne(s) refusée(s) : {raison}", { n: bilan.refuses.length, raison: t(bilan.refuses[0]) }) };
  return { message: t("Inventaire enregistré : {corriges} produit(s) corrigé(s), {inchanges} déjà exact(s).", { corriges: bilan.corriges, inchanges: bilan.inchanges }) };
}

/** Fixe ou retire le seuil d'alerte de stock bas d'un produit suivi (champ vide = pas d'alerte). */
export async function definirSeuilAlerteProduit(produitId: string, _etat: EtatStock, formData: FormData): Promise<EtatStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const texte = String(formData.get("seuil") ?? "").trim();
  const seuil = texte === "" ? null : Number(texte);
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => ((await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? definirSeuilAlerte(tx, utilisateurConnecte.entrepriseId, produitId, seuil) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  return { message: resultat.seuil === null ? t("L'alerte de stock bas est retirée.") : t("Alerte enregistrée : vous serez prévenu à {n} ou moins.", { n: resultat.seuil }) };
}

/** Arrête le suivi du stock d'un produit : ce qui restait sort du suivi (ligne « Fin du suivi » par dépôt). Réservé à qui modifie les produits. */
export async function arreterSuiviStockProduit(produitId: string): Promise<EtatStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier le stock.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) =>
    (await gestionStockActive(tx, utilisateurConnecte.entrepriseId)) ? arreterSuiviStock(tx, utilisateurConnecte.entrepriseId, produitId, utilisateurConnecte.utilisateurId) : ({ ok: false, erreur: MESSAGE_STOCK_DESACTIVE } as const)
  );
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/produits/${produitId}`);
  revalidatePath("/app/produits");
  return { message: t("Le suivi du stock est arrêté pour ce produit.") };
}
