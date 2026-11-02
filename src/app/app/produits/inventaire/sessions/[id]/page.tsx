import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { StockDesactive } from "@/components/stock-desactive";
import { gestionStockActive } from "@/lib/produits/gestion-stock";
import { lireSessionInventaire } from "@/lib/produits/inventaire-session";
import { getT } from "@/lib/i18n/langue";
import { Comptage } from "./comptage";

export default async function PageSessionInventaire({ params }: { params: Promise<{ id: string }> }) {
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
  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => ((await gestionStockActive(tx, u.entrepriseId)) ? { vue: await lireSessionInventaire(tx, u.entrepriseId, id) } : null));
  if (!donnees) return <StockDesactive peutActiver={peut(u, "PARAMETRES", "MODIFIER")} />;
  if (!donnees.vue) notFound();
  const { session, lignes } = donnees.vue;

  const ouvert = session.statut === "OUVERT";
  const date = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Douala" });
  const STATUT = { OUVERT: t("En cours"), VALIDE: t("Validé"), ANNULE: t("Abandonné") } as const;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/produits/inventaire/sessions" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ClipboardList className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{session.nom}</h1>
          <Badge variant={ouvert ? "warning" : session.statut === "VALIDE" ? "success" : "neutral"}>{STATUT[session.statut]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.depotNom} · {t("ouvert le {date}", { date: date.format(session.creeLe) })}
          {session.creeParNom ? ` ${t("par {nom}", { nom: session.creeParNom })}` : ""}
          {session.termineLe ? ` · ${t("terminé le {date}", { date: date.format(session.termineLe) })}` : ""}
        </p>
      </div>

      <Comptage
        sessionId={session.id}
        ouvert={ouvert}
        peutCompter={peut(u, "PRODUITS", "MODIFIER")}
        peutValider={peut(u, "PRODUITS", "MODIFIER") && peut(u, "PARAMETRES", "MODIFIER")}
        peutAbandonner={peut(u, "PRODUITS", "MODIFIER")}
        lignes={lignes.map((l) => ({ produitId: l.produitId, nom: l.nom, stockDepot: l.stockDepot, coutMoyen: l.coutMoyen, codeBarres: l.codeBarres, comptee: l.quantiteComptee, theorique: l.quantiteTheorique, comptePar: l.comptePar }))}
      />
    </div>
  );
}
