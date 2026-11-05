"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { getT } from "@/lib/i18n/langue";
import { ajouterTachePoste, retirerTachePoste } from "@/lib/rh/taches-poste";

export type EtatTachePoste = { erreur?: string; message?: string } | null;

/**
 * Pose une tâche du poste sur la fiche d'un collaborateur. Droit et portée revérifiés côté serveur (Administrateur, ou Manager dont la portée RH
 * contient la personne) ; l'identifiant de la personne vient de la fiche ouverte, relu en base avec l'entreprise de la session.
 */
export async function ajouterTachePosteAction(cibleId: string, utilisateurDossierId: string, _etat: EtatTachePoste, formData: FormData): Promise<EtatTachePoste> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const champ = (k: string) => String(formData.get(k) ?? "");
  const r = await avecEntreprise(u.entrepriseId, (tx) => ajouterTachePoste(tx, u, String(cibleId), { titre: champ("titre"), description: champ("description"), frequence: champ("frequence") }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/rh/${utilisateurDossierId}`);
  return { message: t("Tâche ajoutée.") };
}

export async function retirerTachePosteAction(tacheId: string, utilisateurDossierId: string): Promise<{ erreur?: string } | null> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const r = await avecEntreprise(u.entrepriseId, (tx) => retirerTachePoste(tx, u, String(tacheId)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/rh/${utilisateurDossierId}`);
  return null;
}
