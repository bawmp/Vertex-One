"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { modifierInfosPersonnelles } from "@/lib/rh/infos-personnelles";
import { getT } from "@/lib/i18n/langue";

export type EtatFiche = { erreur?: string; message?: string } | null;

const aujourdhuiDouala = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());

/**
 * Informations personnelles d'une fiche (date de naissance, téléphone, adresse, personne à prévenir) : la personne concernée, l'Administrateur
 * ou son Manager (portée RH). Le droit et la portée sont revérifiés côté serveur ; le salaire n'est jamais touché par cette action.
 */
export async function enregistrerInfosPersonnelles(dossierRHId: string, _etat: EtatFiche, formData: FormData): Promise<EtatFiche> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (u.role === "CLIENT" || u.role === "COMPTABLE") return { erreur: t("Cette fonction est réservée aux collaborateurs de l'entreprise.") };
  const champ = (k: string) => String(formData.get(k) ?? "");
  const r = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!e || !disponible(e, "RH")) return { ok: false, erreur: t("Les Ressources Humaines sont disponibles à partir du forfait Business.") } as const;
    return modifierInfosPersonnelles(tx, u, String(dossierRHId), { dateNaissance: champ("dateNaissance"), telephone: champ("telephone"), adresse: champ("adresse"), urgenceNom: champ("urgenceNom"), urgenceTelephone: champ("urgenceTelephone") }, aujourdhuiDouala());
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath("/app/rh");
  revalidatePath(`/app/rh/${dossierRHId}`);
  return { message: t("Informations enregistrées.") };
}
