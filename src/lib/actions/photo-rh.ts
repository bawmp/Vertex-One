"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { enregistrerPhotoStagiaire, enregistrerPhotoUtilisateur, preparerPhoto, retirerPhotoUtilisateur } from "@/lib/rh/photo";
import { trouverStagiaireAcademique } from "@/lib/rh/stage";
import { getT } from "@/lib/i18n/langue";

export type EtatPhoto = { erreur?: string; message?: string } | null;

function rafraichir() {
  revalidatePath("/app/rh");
  revalidatePath("/app/rh/[id]", "page");
  revalidatePath("/app/rh/stagiaires");
}

async function connecte() {
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  return u;
}

/** Sa propre photo : n'importe quel collaborateur interne (jamais un client du portail). L'identifiant vient de la session, jamais du navigateur. */
export async function changerMaPhoto(_etat: EtatPhoto, formData: FormData): Promise<EtatPhoto> {
  const t = await getT();
  const u = await connecte();
  if (u.role === "CLIENT" || u.role === "COMPTABLE") return { erreur: t("Cette fonction est réservée aux collaborateurs de l'entreprise.") };
  const prete = await preparerPhoto(formData.get("photo"));
  if (!prete.ok) return { erreur: t(prete.erreur) };
  const r = await avecEntreprise(u.entrepriseId, (tx) => enregistrerPhotoUtilisateur(tx, u.entrepriseId, u.utilisateurId, prete.photo));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return { message: t("Photo enregistrée.") };
}

export async function retirerMaPhoto(): Promise<EtatPhoto> {
  const t = await getT();
  const u = await connecte();
  if (u.role === "CLIENT" || u.role === "COMPTABLE") return { erreur: t("Cette fonction est réservée aux collaborateurs de l'entreprise.") };
  const r = await avecEntreprise(u.entrepriseId, (tx) => retirerPhotoUtilisateur(tx, u.entrepriseId, u.utilisateurId));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return { message: t("Photo retirée.") };
}

/** L'Administrateur peut poser ou corriger la photo de n'importe quel collaborateur de son entreprise (par exemple quelqu'un qui n'y arrive pas). */
export async function changerPhotoCollaborateur(utilisateurId: string, _etat: EtatPhoto, formData: FormData): Promise<EtatPhoto> {
  const t = await getT();
  const u = await connecte();
  if (u.role !== "ADMIN") return { erreur: t("Seul l'Administrateur peut changer la photo d'un autre collaborateur.") };
  const prete = await preparerPhoto(formData.get("photo"));
  if (!prete.ok) return { erreur: t(prete.erreur) };
  const r = await avecEntreprise(u.entrepriseId, (tx) => enregistrerPhotoUtilisateur(tx, u.entrepriseId, String(utilisateurId), prete.photo));
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return { message: t("Photo enregistrée.") };
}

/** Un stagiaire académique n'a pas de compte : l'Administrateur ou le responsable qui peut voir sa fiche pose sa photo. */
export async function changerPhotoStagiaire(stagiaireId: string, _etat: EtatPhoto, formData: FormData): Promise<EtatPhoto> {
  const t = await getT();
  const u = await connecte();
  if ((u.role !== "ADMIN" && u.role !== "MANAGER") || !peut(u, "RH", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de modifier cette fiche.") };
  const prete = await preparerPhoto(formData.get("photo"));
  if (!prete.ok) return { erreur: t(prete.erreur) };
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (!(await trouverStagiaireAcademique(tx, u, String(stagiaireId)))) return { ok: false, erreur: t("Stagiaire introuvable.") } as const;
    return enregistrerPhotoStagiaire(tx, u.entrepriseId, String(stagiaireId), prete.photo);
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  rafraichir();
  return { message: t("Photo enregistrée.") };
}
