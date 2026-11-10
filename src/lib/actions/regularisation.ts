"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { dateDouala } from "@/lib/comptabilite/livres";
import { enregistrerRegularisation } from "@/lib/comptabilite/regularisations";
import { definitionRegularisation } from "@/lib/comptabilite/regularisations-regles";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatRegularisation = { erreur?: string; message?: string } | null;

/**
 * Régularisation de fin d'exercice (charge à payer, produit à recevoir, charge ou produit constaté d'avance, provision) et son extourne
 * facultative. Écrit en comptabilité : droit CREER et forfait comptabilité complète revérifiés ici. Le type, le montant et le compte
 * viennent du formulaire mais ne sont jamais crus : type validé contre la liste fermée, compte relu en base et contrôlé (classe),
 * montant entier positif, période non verrouillée.
 */
export async function enregistrerRegularisationAction(_etat: EtatRegularisation, formData: FormData): Promise<EtatRegularisation> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", "CREER")) return { erreur: t("Vous n'avez pas le droit de passer une écriture comptable.") };

  const type = String(formData.get("type") ?? "");
  const def = definitionRegularisation(type);
  if (!def) return { erreur: t("Type de régularisation inconnu.") };
  const date = dateDouala(String(formData.get("date") ?? ""), false);
  if (!date) return { erreur: t("Date invalide.") };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.") } as const;
    return enregistrerRegularisation(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, {
      type: def.type,
      montant: Number(String(formData.get("montant") ?? "").replace(/\s/g, "")),
      compteGestion: String(formData.get("compte") ?? "") || null,
      date,
      libelle: String(formData.get("libelle") ?? ""),
      extourne: formData.get("extourne") === "oui",
    });
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app/comptabilite/regularisations");
  revalidatePath("/app/comptabilite/journaux-manuels");
  revalidatePath("/app/comptabilite");
  return {
    message: resultat.numeroExtourne
      ? t("Régularisation enregistrée ({numero}) et extourne passée au 1er janvier suivant ({extourne}).", { numero: resultat.numero, extourne: resultat.numeroExtourne })
      : t("Régularisation enregistrée ({numero}).", { numero: resultat.numero }),
  };
}
