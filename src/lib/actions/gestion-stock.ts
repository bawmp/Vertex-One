"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { modifierGestionStock } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";

export type EtatGestionStock = { erreur?: string; message?: string } | null;

/** Active ou désactive la gestion de stock de l'entreprise (Paramètres → Entreprise). Réservé à qui modifie les paramètres (l'Administrateur). */
export async function changerGestionStock(activer: boolean): Promise<EtatGestionStock> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")) return { erreur: t("Seul un Administrateur peut modifier ces informations.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => modifierGestionStock(tx, utilisateurConnecte.entrepriseId, activer === true));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app", "layout");
  return { message: resultat.active ? t("Gestion de stock activée : suivez le stock de vos produits depuis leur fiche.") : t("Gestion de stock désactivée.") };
}
