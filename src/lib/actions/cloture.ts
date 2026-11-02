"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { cloturerExercice, rouvrirExercice } from "@/lib/comptabilite/cloture";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatCloture = { erreur?: string; message?: string } | null;

/**
 * Clôture d'un exercice. Passe l'écriture de clôture ET verrouille la comptabilité : il faut donc pouvoir créer et modifier en
 * comptabilité (l'Administrateur), sur le forfait comptabilité complète. Tout est revérifié ici ; l'année vient du formulaire mais
 * n'est qu'un numéro validé (2000 à 2100), jamais un identifiant d'entreprise.
 */
export async function cloturerExerciceAction(_etat: EtatCloture, formData: FormData): Promise<EtatCloture> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", "CREER") || !peut(utilisateurConnecte, "COMPTABILITE", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut clôturer un exercice.") };
  if (formData.get("confirmation") !== "oui") return { erreur: t("Cochez la case de confirmation avant de clôturer.") };

  const annee = Number(formData.get("annee"));
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("La comptabilité complète est disponible à partir du forfait Business.") } as const;
    return cloturerExercice(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, annee);
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app/comptabilite/cloture");
  revalidatePath("/app/comptabilite");
  return {
    message: t("Exercice {annee} clôturé ({numero}) : {sens} de {montant}. La comptabilité est verrouillée jusqu'au 31/12/{annee}.", {
      annee,
      numero: resultat.numero,
      sens: resultat.resultatNet >= 0 ? t("bénéfice") : t("perte"),
      montant: formaterFCFA(Math.abs(resultat.resultatNet)),
    }),
  };
}

/**
 * Rouvre le dernier exercice clôturé. Même droit que la clôture (créer ET modifier en comptabilité, Administrateur) et même forfait ;
 * un motif est obligatoire et reste dans l'historique. L'année n'est qu'un numéro validé, jamais un identifiant d'entreprise.
 */
export async function rouvrirExerciceAction(_etat: EtatCloture, formData: FormData): Promise<EtatCloture> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", "CREER") || !peut(utilisateurConnecte, "COMPTABILITE", "MODIFIER")) return { erreur: t("Seul l'Administrateur peut clôturer un exercice.") };
  if (formData.get("confirmation") !== "oui") return { erreur: t("Cochez la case de confirmation avant de continuer.") };

  const annee = Number(formData.get("annee"));
  const motif = String(formData.get("motif") ?? "");
  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return { ok: false, erreur: m("La comptabilité complète est disponible à partir du forfait Business.") } as const;
    return rouvrirExercice(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, annee, motif);
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath("/app/comptabilite/cloture");
  revalidatePath("/app/comptabilite");
  return { message: t("Exercice {annee} rouvert : l'écriture de clôture est annulée et la comptabilité est de nouveau modifiable.", { annee }) };
}
