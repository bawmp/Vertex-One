import { redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, ClipboardCheck, Lock } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { FormulaireInventaire } from "./formulaire-inventaire";
import { getT } from "@/lib/i18n/langue";

export default async function PageInventaire() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PRODUITS", "MODIFIER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas le droit de modifier le stock.")}</p>
      </div>
    );
  }

  const lignes = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx
      .select({ id: produit.id, nom: produit.nom, stockActuel: produit.stockActuel })
      .from(produit)
      .where(and(eq(produit.type, "BIEN"), eq(produit.suiviStock, true)))
      .orderBy(asc(produit.nom))
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Inventaire")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Comptez ce qu'il y a vraiment en rayon et tapez les quantités : l'écart avec le système se calcule et le stock est corrigé.")}</p>
      </div>
      {lignes.length === 0 ? (
        <EtatVide icone={ClipboardCheck} titre={t("Aucun produit à inventorier.")} description={t("Activez le suivi du stock sur vos produits depuis l'onglet Stock de leur fiche.")} />
      ) : (
        <FormulaireInventaire lignes={lignes} />
      )}
    </div>
  );
}
