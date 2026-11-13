import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { effacerObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { detecterFormat } from "@/lib/one-form/fichiers";
import { m } from "@/lib/i18n/catalogue";

/**
 * Image d'un produit envoyée par un utilisateur (2026-11-13) : création d'un produit, ajout ou remplacement depuis sa fiche. Un seul contrôle pour
 * tous les chemins : le fichier est reconnu sur ses OCTETS (JPEG, PNG ou WebP — jamais sur le type annoncé par le navigateur ni sur l'extension :
 * une page web renommée « photo.jpg » est refusée), limité à 4 Mo (le corps d'une requête est limité à 4,5 Mo chez l'hébergeur ; le navigateur
 * réduit déjà les grandes photos avant l'envoi, voir redimensionner-image.ts). L'image est rangée dans R2 sous le dossier de l'entreprise
 * (`<entrepriseId>/produits/…`), jamais servie par son lien direct (route signée `/app/produits/[id]/image`).
 */
export const TAILLE_MAX_IMAGE_PRODUIT = 4 * 1024 * 1024;

export type ImageValidee = { octets: Buffer; mime: string; extension: string };

export async function validerImageProduit(fichier: FormDataEntryValue | null): Promise<{ ok: true; image: ImageValidee } | { ok: false; erreur: string }> {
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: m("Sélectionnez une image.") };
  if (fichier.size > TAILLE_MAX_IMAGE_PRODUIT) return { ok: false, erreur: m("L'image est trop lourde (4 Mo au plus).") };
  const octets = Buffer.from(await fichier.arrayBuffer());
  const format = detecterFormat(octets);
  if (!format || format.categorie !== "IMAGE") return { ok: false, erreur: m("Ce fichier n'est pas une image JPEG, PNG ou WebP.") };
  return { ok: true, image: { octets, mime: format.mime, extension: format.extension } };
}

/** Range l'image dans R2 (nom neutre : jamais le nom du fichier de l'utilisateur). `cleStockage` est null si R2 n'est pas disponible. */
export async function stockerImageProduit(entrepriseId: string, image: ImageValidee, nom: string): Promise<{ cleStockage: string | null; erreur?: string }> {
  const r = await televerserDocument({ entrepriseId, nomFichier: `${nom}.${image.extension}`, typeMime: image.mime, contenu: image.octets, dossier: "produits" });
  return r.televerse ? { cleStockage: r.cleStockage } : { cleStockage: null, erreur: m("Le stockage des images n'est pas disponible pour le moment : réessayez plus tard.") };
}

/**
 * Pose (ou remplace) l'image d'un produit EXISTANT de l'entreprise. Le produit est cherché sous la RLS de l'entreprise : l'image d'un produit d'une
 * autre entreprise ne peut ni être posée ni remplacée. L'ancien objet R2 est effacé APRÈS le succès, jamais laissé orphelin ; une éventuelle adresse
 * d'image à charger (import) et son motif de refus sont effacés, l'image envoyée ayant la priorité.
 */
export async function poserImageProduit(entrepriseId: string, produitId: string, image: ImageValidee): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const stockage = await stockerImageProduit(entrepriseId, image, `produit-${produitId}-${Date.now().toString(36)}`);
  if (!stockage.cleStockage) return { ok: false, erreur: stockage.erreur ?? m("Échec du téléversement.") };

  const ancienne = await avecEntreprise(entrepriseId, async (tx) => {
    const [avant] = await tx.select({ cle: produit.imageCleStockage }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
    if (!avant) return undefined;
    await tx
      .update(produit)
      .set({ imageCleStockage: stockage.cleStockage, imageTypeMime: image.mime, imageSourceUrl: null, imageSourceErreur: null })
      .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
    return avant.cle;
  });
  if (ancienne === undefined) {
    await effacerObjetStockage(stockage.cleStockage); // produit introuvable (ou d'une autre entreprise) : rien ne doit rester dans R2
    return { ok: false, erreur: m("Produit introuvable.") };
  }
  if (ancienne) await effacerObjetStockage(ancienne);
  return { ok: true };
}

/** Retire l'image d'un produit de l'entreprise : l'objet R2 est effacé, et le produit retrouve l'icône par défaut. Sans effet si le produit n'a pas d'image. */
export async function retirerImageProduit(entrepriseId: string, produitId: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const ancienne = await avecEntreprise(entrepriseId, async (tx) => {
    const [avant] = await tx.select({ cle: produit.imageCleStockage }).from(produit).where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
    if (!avant) return undefined;
    await tx
      .update(produit)
      .set({ imageCleStockage: null, imageTypeMime: null, imageSourceUrl: null, imageSourceErreur: null })
      .where(and(eq(produit.id, produitId), eq(produit.entrepriseId, entrepriseId)));
    return avant.cle;
  });
  if (ancienne === undefined) return { ok: false, erreur: m("Produit introuvable.") };
  if (ancienne) await effacerObjetStockage(ancienne);
  return { ok: true };
}
