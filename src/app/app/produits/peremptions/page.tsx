import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarX2, CircleCheck, Lock } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { lirePeremptions } from "@/lib/produits/lots";
import { getT } from "@/lib/i18n/langue";

export default async function PagePeremptions() {
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
  const lignes = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? lirePeremptions(tx, u.entrepriseId) : null));
  if (!lignes) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;

  const perimes = lignes.filter((l) => l.statut === "PERIME");
  const valeurPerimee = perimes.reduce((s, l) => s + l.valeur, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <CalendarX2 className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Péremptions")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Les lots périmés ou qui le seront dans les 30 jours. Ouvrez le produit pour retirer un lot du stock.")}</p>
      </div>

      {lignes.length === 0 ? (
        <EtatVide icone={CircleCheck} titre={t("Rien à surveiller.")} description={t("Aucun lot n'est périmé ni proche de sa date. Activez le suivi par lots dans la fiche d'un produit pour commencer.")} />
      ) : (
        <>
          {perimes.length > 0 ? (
            <Card>
              <div className="flex items-baseline justify-between gap-3 px-4 py-4">
                <span className="text-sm text-muted-foreground">{t("Valeur du stock périmé")}</span>
                <span className="text-2xl font-semibold tabular-nums text-destructive">{formaterFCFA(valeurPerimee)}</span>
              </div>
            </Card>
          ) : null}
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {lignes.map((l) => (
                <Link key={l.lotId} href={`/app/produits/${l.produitId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.produit}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Lot {numero}", { numero: l.numeroLot })} · {l.datePeremption.split("-").reverse().join("/")} · {t("{n} unité(s)", { n: l.quantite })}
                    </p>
                  </div>
                  <Badge variant={l.statut === "PERIME" ? "danger" : "warning"}>{l.statut === "PERIME" ? t("Périmé depuis {n} j", { n: Math.abs(l.jours) }) : l.jours === 0 ? t("Périme aujourd'hui") : t("Dans {n} j", { n: l.jours })}</Badge>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
