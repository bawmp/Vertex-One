import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, ScanBarcode } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { getT } from "@/lib/i18n/langue";
import { ScannerProduits } from "./scanner-produits";

export default async function PageScanner() {
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès au catalogue Produits.")}</p>
      </div>
    );
  }
  if (!(await avecEntreprise(u.entrepriseId, (tx) => gestionStockActive(tx, u.entrepriseId)))) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <ScanBarcode className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Scanner un produit")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Scannez un code-barres avec une douchette ou la caméra du téléphone : le produit, son stock et son prix s'affichent, un clic ouvre sa fiche.")}</p>
      </div>
      <ScannerProduits />
    </div>
  );
}
