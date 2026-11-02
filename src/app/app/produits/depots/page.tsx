import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowLeft, Lock, Warehouse } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { stockDepot } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { listerDepots } from "@/lib/produits/depots";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { GestionDepots } from "./gestion-depots";
import { getT } from "@/lib/i18n/langue";

export default async function PageDepots() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "PRODUITS", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès au catalogue Produits.")}</p>
      </div>
    );
  }

  if (!(await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => gestionStockActive(tx, utilisateurConnecte.entrepriseId)))) return <StockDesactive peutActiver={peut(utilisateurConnecte, "PARAMETRES", "MODIFIER")} />;

  const lignes = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const depots = await listerDepots(tx, utilisateurConnecte.entrepriseId);
    const totaux = await tx
      .select({ depotId: stockDepot.depotId, nbProduits: sql<number>`count(*) filter (where ${stockDepot.quantite} > 0)::int`, nbArticles: sql<number>`coalesce(sum(greatest(${stockDepot.quantite}, 0)), 0)::int` })
      .from(stockDepot)
      .groupBy(stockDepot.depotId);
    const parDepot = new Map(totaux.map((x) => [x.depotId, x]));
    return depots.map((d) => ({ id: d.id, nom: d.nom, principal: d.principal, nbProduits: parDepot.get(d.id)?.nbProduits ?? 0, nbArticles: parDepot.get(d.id)?.nbArticles ?? 0 }));
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Warehouse className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Dépôts")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Boutique, entrepôt… Le dépôt principal reçoit les ventes et les achats de vos documents ; vous déplacez le stock d'un dépôt à l'autre depuis la fiche d'un produit.")}</p>
      </div>
      <GestionDepots depots={lignes} peutModifier={peut(utilisateurConnecte, "PRODUITS", "MODIFIER")} />
    </div>
  );
}
