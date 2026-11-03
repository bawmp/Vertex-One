"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { enregistrerTaux, supprimerTaux } from "@/lib/devises/taux";
import { getT } from "@/lib/i18n/langue";

export type EtatDevises = { erreur?: string; message?: string } | null;

/** Taux de change : réservé à qui peut modifier les paramètres de l'entreprise, revérifié ici ; tout est relu dans l'entreprise de la session. */
async function garde() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PARAMETRES", "MODIFIER")) return { t, u, refus: t("Vous n'avez pas le droit de modifier les paramètres.") };
  return { t, u, refus: null };
}

export async function enregistrerTauxChange(_etat: EtatDevises, formData: FormData): Promise<EtatDevises> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => enregistrerTaux(tx, u.entrepriseId, { devise: String(formData.get("devise") ?? ""), taux: String(formData.get("taux") ?? ""), dateEffet: String(formData.get("dateEffet") ?? "") }));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/parametres/devises");
  return { message: t("Taux enregistré.") };
}

export async function supprimerTauxChange(id: string): Promise<EtatDevises> {
  const { t, u, refus } = await garde();
  if (refus) return { erreur: refus };
  const r = await avecEntreprise(u.entrepriseId, (tx) => supprimerTaux(tx, u.entrepriseId, String(id)));
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/parametres/devises");
  return { message: t("Taux supprimé.") };
}
