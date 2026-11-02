import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { lireFamille } from "@/lib/produits/variantes";
import { getT } from "@/lib/i18n/langue";
import { FormulaireFamille } from "../formulaire-famille";

export default async function PageFamille({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? { famille: await lireFamille(tx, u.entrepriseId, id) } : null));
  if (!donnees) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;
  if (!donnees.famille) notFound();
  const { famille } = donnees;
  const stockTotal = famille.variantes.filter((v) => v.suiviStock).reduce((s, v) => s + v.stockActuel, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits/familles" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Layers className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{famille.nom}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("{n} variante(s) — {stock} en stock au total.", { n: famille.variantes.length, stock: stockTotal })}</p>
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>{t("Variante")}</span>
          <span className="text-right">{t("Prix")}</span>
          <span className="text-right">{t("Stock")}</span>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {famille.variantes.map((v) => (
            <Link key={v.id} href={`/app/produits/${v.id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2 text-sm transition-colors hover:bg-muted/40">
              <span className="truncate font-medium">{v.variante ?? v.nom}</span>
              <span className="text-right tabular-nums text-muted-foreground">{formaterFCFA(v.prixVente)}</span>
              <span className="text-right tabular-nums">{v.suiviStock ? v.stockActuel === 0 ? <Badge variant="danger">0</Badge> : v.stockActuel : "—"}</span>
            </Link>
          ))}
        </div>
      </Card>

      {peut(u, "PRODUITS", "CREER") ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("Ajouter des variantes")}</h2>
          <FormulaireFamille familleId={famille.id} nomFamille={famille.nom} />
        </div>
      ) : null}
    </div>
  );
}
