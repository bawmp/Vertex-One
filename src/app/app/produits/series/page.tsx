import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hash, Lock, Search } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { garantiesASurveiller, rechercherSeries } from "@/lib/produits/series";
import { etatGarantie, joursAvantFinGarantie } from "@/lib/produits/series-regles";
import { getT } from "@/lib/i18n/langue";

/** Retrouver un numéro de série (en entier ou en partie) : le produit, l'état, la date d'entrée et le document de vente. */
export default async function PageRechercheSeries({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
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
  const saisie = (q ?? "").slice(0, 60);
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(new Date());
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? { resultats: await rechercherSeries(tx, u.entrepriseId, saisie), garanties: await garantiesASurveiller(tx, u.entrepriseId, aujourdhui) } : null));
  const resultats = donnees?.resultats ?? null;
  const garanties = donnees?.garanties ?? [];
  if (!resultats) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;
  const date = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" }) : "");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Hash className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Numéros de série")}</h1>
      </div>
      <form method="get" className="flex items-center gap-2" role="search">
        <Input name="q" defaultValue={saisie} placeholder={t("Numéro de série (en entier ou en partie)")} aria-label={t("Numéro de série (en entier ou en partie)")} autoFocus className="max-w-sm" />
        <Button type="submit" variant="outline">
          <Search data-icon="inline-start" aria-hidden />
          {t("Chercher")}
        </Button>
      </form>

      {saisie.trim().length < 2 && garanties.length > 0 ? (
        <Card className="p-0">
          <p className="border-b px-4 py-2.5 text-sm font-medium">{t("Garanties à surveiller (30 jours)")}</p>
          <div className="flex flex-col divide-y divide-border">
            {garanties.map((g) => {
              const etat = etatGarantie(g.garantieFin, aujourdhui);
              const reste = joursAvantFinGarantie(g.garantieFin, aujourdhui);
              return (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{g.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/app/produits/${g.produitId}`} className="underline-offset-4 hover:underline">{g.produit}</Link> · {t("garantie jusqu'au {date}", { date: g.garantieFin.split("-").reverse().join("/") })}
                    </p>
                  </div>
                  {etat === "EXPIREE" ? <Badge variant="danger">{t("Expirée depuis {n} j", { n: Math.abs(reste ?? 0) })}</Badge> : <Badge variant="warning">{t("Se termine dans {n} j", { n: reste ?? 0 })}</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {saisie.trim().length < 2 ? (
        <EtatVide icone={Hash} titre={t("Saisissez un numéro de série.")} description={t("Deux caractères au moins. Vous verrez le produit, l'état de l'unité et le document de vente.")} />
      ) : resultats.length === 0 ? (
        <EtatVide icone={Hash} titre={t("Aucun numéro trouvé.")} description={t("Vérifiez la saisie : la recherche porte sur les produits qui suivent leurs numéros de série.")} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {resultats.map((r) => {
              const lien = r.documentType === "FACTURE" && r.documentId ? `/app/facturation/factures/${r.documentId}` : r.documentType === "RECU_VENTE" ? "/app/facturation#tickets-de-vente" : null;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{r.numero}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link href={`/app/produits/${r.produitId}`} className="underline-offset-4 hover:underline">{r.produit}</Link> · {t("entré le {date}", { date: date(r.entreLe) })}
                      {r.statut === "VENDU" ? ` · ${t("vendu le {date}", { date: date(r.venduLe) })}` : ""}
                      {lien ? <> · <Link href={lien} className="underline-offset-4 hover:underline">{t("voir le document")}</Link></> : null}
                      {r.statut === "VENDU" && r.garantieFin ? ` · ${t("garantie jusqu'au {date}", { date: r.garantieFin.split("-").reverse().join("/") })}` : ""}
                    </p>
                  </div>
                  {r.statut === "EN_STOCK" ? <Badge variant="success">{t("En stock")}</Badge> : r.statut === "VENDU" ? <Badge variant="info">{t("Vendu")}</Badge> : <Badge variant="neutral">{t("Retiré")}</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
