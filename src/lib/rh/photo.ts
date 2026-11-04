import { and, eq } from "drizzle-orm";
import type { TransactionDrizzle } from "@/db/client";
import { stagiaireAcademique, utilisateur } from "@/db/schema";
import { effacerObjetStockage, televerserDocument } from "@/lib/documents/stockage";
import { validerFichier } from "@/lib/one-form/fichiers";

/** Photo de la fiche collaborateur : 2 Mo au plus, image reconnue sur ses octets (PNG, JPEG, WebP, GIF), jamais SVG ni HTML. */
export const TAILLE_MAX_PHOTO = 2 * 1024 * 1024;

export type PhotoPreparee = { octets: Buffer; mime: string; extension: string };
export type ResultatPhoto = { ok: true } | { ok: false; erreur: string };

/** Valide le fichier reçu (avant tout accès à la base ou au stockage). */
export async function preparerPhoto(fichier: unknown): Promise<{ ok: true; photo: PhotoPreparee } | { ok: false; erreur: string }> {
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: "Choisissez une photo." };
  if (fichier.size > TAILLE_MAX_PHOTO) return { ok: false, erreur: "La photo est trop lourde (2 Mo au maximum)." };
  const octets = Buffer.from(await fichier.arrayBuffer());
  const verdict = validerFichier({ taille: octets.length, octets, categories: ["IMAGE"] });
  if (!verdict.ok) return { ok: false, erreur: verdict.erreur };
  return { ok: true, photo: { octets, mime: verdict.format.mime, extension: verdict.format.extension } };
}

async function stocker(entrepriseId: string, cible: "utilisateurs" | "stagiaires", id: string, photo: PhotoPreparee): Promise<string | null> {
  const r = await televerserDocument({ entrepriseId, nomFichier: `photo.${photo.extension}`, typeMime: photo.mime, contenu: photo.octets, dossier: `rh/photos/${cible}/${id}` });
  return r.televerse ? r.cleStockage : null;
}

/** Remplace la photo d'un collaborateur (la précédente est effacée du stockage). Le collaborateur est relu dans l'entreprise. */
export async function enregistrerPhotoUtilisateur(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string, photo: PhotoPreparee): Promise<ResultatPhoto> {
  const [u] = await tx.select({ ancienne: utilisateur.photoCleStockage }).from(utilisateur).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  if (!u) return { ok: false, erreur: "Collaborateur introuvable." };
  const cle = await stocker(entrepriseId, "utilisateurs", utilisateurId, photo);
  if (!cle) return { ok: false, erreur: "Le stockage des fichiers n'est pas disponible pour le moment." };
  await tx.update(utilisateur).set({ photoCleStockage: cle, photoTypeMime: photo.mime }).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  if (u.ancienne) await effacerObjetStockage(u.ancienne);
  return { ok: true };
}

export async function retirerPhotoUtilisateur(tx: TransactionDrizzle, entrepriseId: string, utilisateurId: string): Promise<ResultatPhoto> {
  const [u] = await tx.select({ ancienne: utilisateur.photoCleStockage }).from(utilisateur).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  if (!u) return { ok: false, erreur: "Collaborateur introuvable." };
  await tx.update(utilisateur).set({ photoCleStockage: null, photoTypeMime: null }).where(and(eq(utilisateur.id, utilisateurId), eq(utilisateur.entrepriseId, entrepriseId)));
  if (u.ancienne) await effacerObjetStockage(u.ancienne);
  return { ok: true };
}

/** Photo d'un stagiaire académique (sans compte : posée par l'Administrateur ou le responsable). */
export async function enregistrerPhotoStagiaire(tx: TransactionDrizzle, entrepriseId: string, stagiaireId: string, photo: PhotoPreparee): Promise<ResultatPhoto> {
  const [s] = await tx.select({ ancienne: stagiaireAcademique.photoCleStockage }).from(stagiaireAcademique).where(and(eq(stagiaireAcademique.id, stagiaireId), eq(stagiaireAcademique.entrepriseId, entrepriseId)));
  if (!s) return { ok: false, erreur: "Stagiaire introuvable." };
  const cle = await stocker(entrepriseId, "stagiaires", stagiaireId, photo);
  if (!cle) return { ok: false, erreur: "Le stockage des fichiers n'est pas disponible pour le moment." };
  await tx.update(stagiaireAcademique).set({ photoCleStockage: cle, photoTypeMime: photo.mime }).where(and(eq(stagiaireAcademique.id, stagiaireId), eq(stagiaireAcademique.entrepriseId, entrepriseId)));
  if (s.ancienne) await effacerObjetStockage(s.ancienne);
  return { ok: true };
}

export { adressePhoto, initiales } from "./photo-affichage";
