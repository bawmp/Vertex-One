import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Landmark, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { FormulaireImportReleve } from "./formulaire-import-releve";

export default async function PageRapprochementBancaire() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité est réservée à l&apos;Administrateur.</p>
      </div>
    );
  }

  const disponibleIci = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    return disponible(monEntreprise, "COMPTABILITE_COMPLETE");
  });

  if (!disponibleIci) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <Landmark className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Rapprochement bancaire</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Importez un relevé au format CSV (colonnes : date, libellé, montant) pour retrouver les paiements déjà
        enregistrés qui correspondent probablement à chaque ligne — même montant, date à 5 jours près.
      </p>

      <FormulaireImportReleve />
    </div>
  );
}
