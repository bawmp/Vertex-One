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
import { creerImmobilisation, passerDotationsExercice, supprimerImmobilisation } from "@/lib/comptabilite/immobilisations";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

export type EtatImmobilisation = { erreur?: string; message?: string } | null;

/**
 * Registre des immobilisations. Écrit en comptabilité (acquisition, dotations) : droit CREER (suppression : MODIFIER) et forfait
 * comptabilité complète revérifiés ici. Catégorie, contrepartie et durée sont des valeurs d'une liste fermée relues par la règle ;
 * l'identifiant du bien à retirer est relu sous la protection par entreprise (un identifiant d'une autre entreprise ne renvoie rien).
 */
async function garde(droit: "CREER" | "MODIFIER") {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", droit)) return { utilisateurConnecte, refus: m("Vous n'avez pas le droit de passer une écriture comptable.") };
  return { utilisateurConnecte, refus: null };
}

async function forfaitOk(entrepriseId: string, tx: Parameters<Parameters<typeof avecEntreprise>[1]>[0]) {
  const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  return disponible(monEntreprise, "COMPTABILITE_COMPLETE");
}
const REFUS_FORFAIT = m("La comptabilité complète est disponible à partir du forfait Business.");

export async function ajouterImmobilisationAction(_etat: EtatImmobilisation, formData: FormData): Promise<EtatImmobilisation> {
  const t = await getT();
  const { utilisateurConnecte, refus } = await garde("CREER");
  if (refus) return { erreur: t(refus) };
  const date = dateDouala(String(formData.get("date") ?? ""), false);
  if (!date) return { erreur: t("Date invalide.") };
  const contrepartie = String(formData.get("contrepartie") ?? "");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await forfaitOk(utilisateurConnecte.entrepriseId, tx))) return { ok: false, erreur: REFUS_FORFAIT } as const;
    return creerImmobilisation(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, {
      libelle: String(formData.get("libelle") ?? ""),
      compteActif: String(formData.get("categorie") ?? ""),
      dateAcquisition: date,
      valeurAcquisition: Number(String(formData.get("valeur") ?? "").replace(/\s/g, "")),
      valeurResiduelle: Number(String(formData.get("residuelle") ?? "0").replace(/\s/g, "") || 0),
      dureeAnnees: Number(formData.get("duree")),
      contrepartieAcquisition: contrepartie && contrepartie !== "AUCUNE" ? contrepartie : null,
    });
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath("/app/comptabilite/immobilisations");
  revalidatePath("/app/comptabilite");
  return { message: t("Bien ajouté au registre.") };
}

export async function passerDotationsAction(_etat: EtatImmobilisation, formData: FormData): Promise<EtatImmobilisation> {
  const t = await getT();
  const { utilisateurConnecte, refus } = await garde("CREER");
  if (refus) return { erreur: t(refus) };
  const annee = Number(formData.get("annee"));

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await forfaitOk(utilisateurConnecte.entrepriseId, tx))) return { ok: false, erreur: REFUS_FORFAIT } as const;
    return passerDotationsExercice(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, annee);
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath("/app/comptabilite/immobilisations");
  revalidatePath("/app/comptabilite/journaux-manuels");
  revalidatePath("/app/comptabilite");
  if (!resultat.numero) return { message: t("Rien à passer pour {annee} : toutes les dotations sont déjà enregistrées.", { annee }) };
  return { message: t("Dotations {annee} passées ({numero}) : {nombre} bien(s), {total}.", { annee, numero: resultat.numero, nombre: resultat.nombre, total: formaterFCFA(resultat.total) }) };
}

export async function retirerImmobilisationAction(_etat: EtatImmobilisation, formData: FormData): Promise<EtatImmobilisation> {
  const t = await getT();
  const { utilisateurConnecte, refus } = await garde("MODIFIER");
  if (refus) return { erreur: t(refus) };

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await forfaitOk(utilisateurConnecte.entrepriseId, tx))) return { ok: false, erreur: REFUS_FORFAIT } as const;
    return supprimerImmobilisation(tx, String(formData.get("id") ?? ""));
  });
  if (!resultat.ok) return { erreur: t(resultat.erreur) };
  revalidatePath("/app/comptabilite/immobilisations");
  return { message: t("Bien retiré du registre.") };
}
