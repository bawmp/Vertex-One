"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { parserCsvReleve, suggererCorrespondances, confirmerRapprochement, type SuggestionRapprochement } from "@/lib/comptabilite/rapprochement";

export type EtatImportReleve = { erreur?: string; suggestions?: SuggestionRapprochement[] } | null;

export async function importerReleveBancaire(_etat: EtatImportReleve, formData: FormData): Promise<EtatImportReleve> {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR")) {
    return { erreur: "Vous n'avez pas le droit d'accéder au rapprochement bancaire." };
  }

  const fichier = formData.get("releve");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Sélectionnez un fichier CSV." };
  }

  const contenu = await fichier.text();
  const lignes = parserCsvReleve(contenu);
  if (lignes.length === 0) {
    return { erreur: "Aucune ligne valide trouvée dans ce fichier (format attendu : date,libellé,montant)." };
  }

  const suggestions = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;

    return suggererCorrespondances(tx, utilisateurConnecte.entrepriseId, lignes);
  });

  if (!suggestions) return { erreur: "La comptabilité complète est disponible à partir du forfait Business." };
  return { suggestions };
}

export async function confirmerRapprochementPaiement(paiementId: string) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "MODIFIER")) return;

  await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => confirmerRapprochement(tx, paiementId));

  revalidatePath("/app/comptabilite/rapprochement");
}
