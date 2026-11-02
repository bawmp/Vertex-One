import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";
import { FormulaireFamille } from "../formulaire-famille";

export default async function PageNouvelleFamille() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "CREER")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas le droit de créer un produit.")}</p>
      </div>
    );
  }
  if (!(await avecEntreprise(u.entrepriseId, (tx) => gestionStockActive(tx, u.entrepriseId)))) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits/familles" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Layers className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Créer des variantes")}</h1>
      </div>
      <FormulaireFamille />
    </div>
  );
}
