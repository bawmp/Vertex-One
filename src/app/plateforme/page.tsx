import Link from "next/link";
import { Building2, Wallet2, Hourglass, ShieldAlert, ArrowRight } from "lucide-react";
import { recupererKpiPlateforme, recupererAdoptionModules } from "@/lib/plateforme/donnees";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LIBELLE_EVENEMENT: Record<string, { texte: string; variant: "warning" | "danger" }> = {
  ESSAI_J3: { texte: "Essai bientôt fini", variant: "warning" },
  ESSAI_TERMINE: { texte: "Essai terminé", variant: "warning" },
  ECHEANCE_J3: { texte: "Échéance proche", variant: "warning" },
  ECHEANCE_DEPASSEE: { texte: "Paiement en retard", variant: "danger" },
  SUSPENDU: { texte: "Suspendue", variant: "danger" },
};

function relatif(date: Date): string {
  const jours = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} jours`;
}

export default async function PagePlateformeAccueil() {
  const [kpi, adoption] = await Promise.all([recupererKpiPlateforme(), recupererAdoptionModules()]);
  const total = kpi.total || 1; // évite une division par zéro sur une plateforme toute neuve

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-1 text-muted-foreground">Vue d&apos;ensemble de toutes les entreprises clientes.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Entreprises</CardDescription>
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{kpi.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>MRR estimé</CardDescription>
            <Wallet2 className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formaterFCFA(kpi.mrrEstime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>En essai</CardDescription>
            <Hourglass className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{kpi.parStatut.essai}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Suspendues</CardDescription>
            <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums">{kpi.parStatut.suspendu}</p>
            {kpi.parStatut.suspendu > 0 ? <Badge variant="danger">À traiter</Badge> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Répartition des abonnements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="bg-sky-500" style={{ width: `${(kpi.parStatut.essai / total) * 100}%` }} title="Essai" />
            <div className="bg-emerald-500" style={{ width: `${(kpi.parStatut.actif / total) * 100}%` }} title="Actif" />
            <div className="bg-red-500" style={{ width: `${(kpi.parStatut.suspendu / total) * 100}%` }} title="Suspendu" />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-500" /> Essai ({kpi.parStatut.essai})</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> Actif ({kpi.parStatut.actif})</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" /> Suspendu ({kpi.parStatut.suspendu})</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adoption des modules</CardTitle>
          <CardDescription>
            Nombre d&apos;entreprises qui utilisent réellement chaque module (au moins une donnée créée) — tous sont inclus dans
            l&apos;abonnement, c&apos;est l&apos;usage qui compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {adoption.map((m) => (
            <div key={m.cle} className="flex items-center gap-3 text-sm">
              <span className="w-56 shrink-0 truncate sm:w-72">{m.libelle}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-marque-bleu" style={{ width: `${(m.entreprises / total) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {m.entreprises} / {kpi.total}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">À surveiller</CardTitle>
            <CardDescription>Essai ou échéance proche, paiement en retard, ou déjà suspendue.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-0">
            {kpi.attention.length > 0 ? (
              <div className="flex flex-col divide-y divide-border">
                {kpi.attention.map((e) => {
                  const libelle = LIBELLE_EVENEMENT[e.evenement];
                  return (
                    <Link key={e.id} href={`/plateforme/entreprises/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                      <span className="font-medium">{e.nom}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant={libelle?.variant ?? "neutral"}>{libelle?.texte ?? e.evenement}</Badge>
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Rien à signaler pour le moment.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inscriptions récentes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-0">
            {kpi.inscriptionsRecentes.length > 0 ? (
              <div className="flex flex-col divide-y divide-border">
                {kpi.inscriptionsRecentes.map((e) => (
                  <Link key={e.id} href={`/plateforme/entreprises/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                    <span className="font-medium">{e.nom}</span>
                    <span className="text-xs text-muted-foreground">{relatif(e.creeLe)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune inscription pour le moment.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
