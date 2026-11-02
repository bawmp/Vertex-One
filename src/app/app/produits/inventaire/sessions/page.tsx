import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Lock } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { listerDepots } from "@/lib/produits/depots";
import { listerSessionsInventaire } from "@/lib/produits/inventaire-session";
import { getT } from "@/lib/i18n/langue";
import { FormulaireOuvrirInventaire } from "./formulaire-ouvrir";

export default async function PageSessionsInventaire() {
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
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? { sessions: await listerSessionsInventaire(tx, u.entrepriseId), depots: await listerDepots(tx, u.entrepriseId) } : null));
  if (!donnees) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;

  const date = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "Africa/Douala" });
  const STATUT = { OUVERT: t("En cours"), VALIDE: t("Validé"), ANNULE: t("Abandonné") } as const;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits/inventaire" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <ClipboardList className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Inventaires à plusieurs")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("Plusieurs personnes comptent en même temps dans un même inventaire. Le stock ne change qu'à la validation par l'Administrateur.")}</p>
      </div>

      {peut(u, "PRODUITS", "MODIFIER") ? <FormulaireOuvrirInventaire depots={donnees.depots.map((d) => ({ id: d.id, nom: d.nom, principal: d.principal }))} /> : null}

      {donnees.sessions.length === 0 ? (
        <EtatVide icone={ClipboardList} titre={t("Aucun inventaire pour le moment.")} description={t("Ouvrez-en un pour commencer à compter.")} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.sessions.map((s) => (
              <Link key={s.id} href={`/app/produits/inventaire/sessions/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.nom}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.depotNom} · {date.format(s.creeLe)} · {t("{n} produit(s) compté(s)", { n: s.comptes })}
                    {s.statut === "VALIDE" && s.nombreCorriges !== null ? ` · ${t("{n} corrigé(s)", { n: s.nombreCorriges })}` : ""}
                  </p>
                </div>
                <Badge variant={s.statut === "OUVERT" ? "warning" : s.statut === "VALIDE" ? "success" : "neutral"}>{STATUT[s.statut]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
