import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, Lock, Plus } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { listerFamilles } from "@/lib/produits/variantes";
import { getT } from "@/lib/i18n/langue";

export default async function PageFamilles() {
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
  const familles = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? listerFamilles(tx, u.entrepriseId) : null));
  if (!familles) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Layers className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Variantes")}</h1>
        </div>
        {peut(u, "PRODUITS", "CREER") ? (
          <Button size="sm" render={<Link href="/app/produits/familles/nouveau" />} nativeButton={false}>
            <Plus data-icon="inline-start" aria-hidden />
            {t("Créer des variantes")}
          </Button>
        ) : null}
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("Un même modèle en plusieurs tailles ou couleurs : chaque variante est un produit avec son stock.")}</p>

      {familles.length === 0 ? (
        <EtatVide icone={Layers} titre={t("Aucune famille de variantes.")} description={t("Créez-en une pour décliner un modèle en tailles, couleurs…")} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {familles.map((f) => (
              <Link key={f.id} href={`/app/produits/familles/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                <p className="truncate font-medium">{f.nom}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{t("{n} variante(s)", { n: f.variantes })} · {t("{n} en stock", { n: f.stock })}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
