import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Tags } from "lucide-react";
import { EtatVide } from "@/components/etat-vide";
import { Card, CardContent } from "@/components/ui/card";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { listerListes } from "@/lib/produits/listes-prix";
import { getT } from "@/lib/i18n/langue";
import { FormulaireListe } from "./formulaire-liste";

export default async function PageListesPrix() {
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
  const listes = await avecEntreprise(u.entrepriseId, (tx) => listerListes(tx, u.entrepriseId));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Tags className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Listes de prix")}</h1>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">{t("Des prix différents selon le client (revendeurs, grossistes…). La liste d'un client pré-remplit les prix de ses devis, commandes et reçus ; vous pouvez toujours les modifier sur le document.")}</p>

      {listes.length === 0 ? (
        <EtatVide icone={Tags} titre={t("Aucune liste de prix.")} description={t("Créez-en une, puis rattachez-la à vos clients depuis leur fiche.")} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {listes.map((l) => (
              <Link key={l.id} href={`/app/produits/listes-prix/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                <p className="truncate font-medium">{l.nom}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("Remise {n} %", { n: l.remisePourcent })} · {t("{n} prix fixe(s)", { n: l.prixFixes })} · {t("{n} client(s)", { n: l.clients })}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {peut(u, "PRODUITS", "MODIFIER") ? (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">{t("Créer une liste de prix")}</h2>
            <FormulaireListe />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
