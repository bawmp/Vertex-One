"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { creerAvoirClient, type LigneACrediter } from "@/lib/facturation/avoir-client";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { getT } from "@/lib/i18n/langue";

export type EtatAvoirClient = { erreur?: string; message?: string } | null;

/**
 * Émet un avoir client partiel depuis la fiche d'une facture. Réservé à qui modifie la facturation (comme l'annulation) ; la facture est
 * relue AVEC l'entreprise de la session, jamais un identifiant d'entreprise venu du navigateur. Les quantités, les lignes et les cases
 * « remettre en stock » sont revérifiées par `creerAvoirClient` : le navigateur ne décide ni des montants ni du stock.
 */
export async function emettreAvoirClient(factureId: string, _etat: EtatAvoirClient, formData: FormData): Promise<EtatAvoirClient> {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "FACTURATION", "MODIFIER")) return { erreur: t("Vous n'avez pas le droit de créer un avoir.") };

  const demandes: LigneACrediter[] = [];
  for (const [cle, valeur] of formData.entries()) {
    if (!cle.startsWith("quantite_")) continue;
    const texte = String(valeur).trim().replace(",", ".");
    if (texte === "") continue;
    const ligneFactureId = cle.slice("quantite_".length);
    demandes.push({ ligneFactureId, quantite: Number(texte), remettreEnStock: formData.get(`stock_${ligneFactureId}`) === "on" });
  }
  const motif = String(formData.get("motif") ?? "");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => creerAvoirClient(tx, utilisateurConnecte.entrepriseId, utilisateurConnecte.utilisateurId, factureId, demandes, motif));
  if (!resultat.ok) return { erreur: t(resultat.erreur) };

  revalidatePath(`/app/facturation/factures/${factureId}`);
  revalidatePath("/app/facturation");
  revalidatePath("/app");
  return {
    message: resultat.factureAnnulee
      ? t("Avoir {numero} de {montant} émis : la facture est entièrement créditée, elle est annulée.", { numero: resultat.numero, montant: formaterFCFA(resultat.montantTTC) })
      : t("Avoir {numero} de {montant} émis : le montant restant dû est réduit d'autant.", { numero: resultat.numero, montant: formaterFCFA(resultat.montantTTC) }),
  };
}
