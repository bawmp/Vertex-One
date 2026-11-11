"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { getT } from "@/lib/i18n/langue";
import { definirOuvertureFiches, modifierFicheOuverte } from "@/lib/rh/fiches-ouvertes";
import type { TypeCible } from "@/lib/rh/fiches-ouvertes-regles";

export type EtatFicheOuverte = { erreur?: string; ok?: boolean } | null;

/**
 * Ouvre ou ferme MES fiches à une entreprise du groupe. Réservé à l'Administrateur ; l'entreprise propriétaire est celle de la session, et le
 * partenaire doit être une autre entreprise du MÊME groupe (relu en base). Un seul sens : ouvrir à B n'ouvre pas B à nous.
 */
export async function ouvrirFichesAction(partenaireId: string, actif: boolean): Promise<{ erreur?: string }> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (u.role !== "ADMIN" || !peut(u, "RH", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut ouvrir les fiches à une autre entreprise.") };
  const ok = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    return Boolean(e) && disponible(e, "RH");
  });
  if (!ok) return { erreur: t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") };
  const fait = await definirOuvertureFiches(u.entrepriseId, String(partenaireId), actif === true);
  if (!fait) return { erreur: t("Cette entreprise ne fait pas partie de votre groupe.") };
  revalidatePath("/app/rh/groupe");
  return {};
}

/** Modifie les informations d'une fiche d'une autre entreprise du groupe qui nous l'a ouverte (liste blanche de champs, trace chez le propriétaire). */
export async function modifierFicheOuverteAction(_etat: EtatFicheOuverte, formData: FormData): Promise<EtatFicheOuverte> {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  const type = formData.get("type") === "STAGIAIRE" ? "STAGIAIRE" : formData.get("type") === "UTILISATEUR" ? "UTILISATEUR" : null;
  if (!type) return { erreur: t("Formulaire invalide.") };
  const ownerId = String(formData.get("entrepriseId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!ownerId || !id) return { erreur: t("Formulaire invalide.") };

  const r = await modifierFicheOuverte(u, ownerId, type as TypeCible, id, (cle) => {
    const v = formData.get(cle);
    return typeof v === "string" ? v : null;
  });
  if (!r.ok) return { erreur: t(r.erreur) };
  revalidatePath(`/app/rh/groupe/fiche/${ownerId}/${type.toLowerCase()}/${id}`);
  return { ok: true };
}
