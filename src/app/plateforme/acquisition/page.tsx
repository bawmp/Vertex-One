import Link from "next/link";
import { Target, UserPlus, Hourglass, Wallet2, Percent, Zap } from "lucide-react";
import { recupererAcquisition } from "@/lib/plateforme/acquisition";
import { essaisARelancer, parCampagne, parOrigine, parParrain, parSecteur, synthese, type LigneGroupe } from "@/lib/acquisition/stats";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);

function TableauGroupe({ titre, entete, description, lignes, vide }: { titre: string; entete: string; description: string; lignes: LigneGroupe[]; vide: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titre}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vide}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{entete}</th>
                  <th className="px-3 py-2 text-right font-medium">Inscrits</th>
                  <th className="px-3 py-2 text-right font-medium">Ont facturé</th>
                  <th className="px-3 py-2 text-right font-medium">Payants</th>
                  <th className="py-2 pl-3 text-right font-medium">Taux payant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.cle} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{l.cle}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.inscrits}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.avecFacture}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.payants}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{pct(l.tauxPayant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Etape({ ok, libelle }: { ok: boolean; libelle: string }) {
  return <Badge variant={ok ? "success" : "neutral"}>{ok ? "✓ " : ""}{libelle}</Badge>;
}

export default async function PageAcquisition() {
  const maintenant = new Date();
  const lignes = await recupererAcquisition();
  const s = synthese(lignes, maintenant);
  const relances = essaisARelancer(lignes, maintenant);
  const aAgir = relances.filter((r) => r.action !== null);
  const progression = Math.min(100, Math.round((s.objectif.atteint / s.objectif.cible) * 100));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Acquisition</h1>
        <p className="mt-1 text-muted-foreground">
          D&apos;où viennent les inscriptions, qui a facturé, qui paie — et qui relancer aujourd&apos;hui.{" "}
          <Link href="/plateforme" className="underline underline-offset-4">Retour au tableau de bord</Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4" aria-hidden />
            Objectif : {s.objectif.cible} clients payants
          </CardTitle>
          <CardDescription>
            {s.objectif.atteint} atteint{s.objectif.atteint > 1 ? "s" : ""}, il en reste {s.objectif.reste}. Un client payant = au moins un paiement d&apos;abonnement confirmé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={s.objectif.cible} aria-valuenow={s.objectif.atteint}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progression}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Inscrits (7 j / 30 j)</CardDescription>
            <UserPlus className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{s.inscrits7j} <span className="text-base font-normal text-muted-foreground">/ {s.inscrits30j}</span></p>
            <p className="text-xs text-muted-foreground">{s.total} au total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Essais en cours</CardDescription>
            <Hourglass className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{s.essaisEnCours}</p>
            <p className="text-xs text-muted-foreground">{aAgir.length} à relancer</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Activation (facture sous 7 j)</CardDescription>
            <Zap className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{pct(s.activation.taux)}</p>
            <p className="text-xs text-muted-foreground">{s.activation.activees} sur {s.activation.eligibles} inscrits depuis 7 jours ou plus</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Conversion essai → payant</CardDescription>
            <Percent className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{pct(s.conversionEssai)}</p>
            <p className="text-xs text-muted-foreground">parmi les essais terminés ou payés</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2 pb-2">
            <CardDescription>Revenu mensuel réel</CardDescription>
            <Wallet2 className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formaterFCFA(s.mrr)}</p>
            <p className="text-xs text-muted-foreground">dernier paiement ÷ mois couverts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">À relancer aujourd&apos;hui</CardTitle>
          <CardDescription>
            Le plan : jour 1 importer, jour 3 première facture, jour 7 premier paiement Mobile Money, puis conclure avant la fin de l&apos;essai. Un client qui n&apos;émet pas sa première facture dans la semaine paie rarement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {relances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun essai en cours.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {relances.map((r) => (
                <Link key={r.id} href={`/plateforme/entreprises/${r.id}`} className="flex flex-col gap-2 py-3 text-sm hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{r.nom}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.adminNom ?? "—"} · {r.adminEmail ?? "—"} · {r.secteur} · origine : {r.origine}
                    </span>
                    <span className={r.action ? "font-medium text-foreground" : "text-muted-foreground"}>{r.action ?? "En bonne voie : rien à faire aujourd'hui."}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                    <Badge variant={r.joursRestants <= 0 ? "danger" : r.joursRestants <= 3 ? "warning" : "brand"}>
                      {r.joursRestants <= 0 ? "Essai terminé" : `J${r.jour} · ${r.joursRestants} j restants`}
                    </Badge>
                    <Etape ok={r.etapes.contacts} libelle="Contacts" />
                    <Etape ok={r.etapes.facture} libelle="Facture" />
                    <Etape ok={r.etapes.paiementClient} libelle="Paiement client" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableauGroupe
          titre="Par origine"
          entete="Origine"
          description="Facebook, parrainage, réseau, direct… « inconnue » = inscrit avant le suivi d'origine."
          lignes={parOrigine(lignes)}
          vide="Aucune inscription pour le moment."
        />
        <TableauGroupe titre="Par secteur" entete="Secteur" description="Le secteur choisi à l'inscription." lignes={parSecteur(lignes)} vide="Aucune inscription pour le moment." />
        <TableauGroupe
          titre="Par campagne"
          entete="Campagne"
          description="Liens avec ?utm_campaign=… : la campagne qui rapporte des payants, pas seulement des inscrits."
          lignes={parCampagne(lignes)}
          vide="Aucune inscription avec une campagne pour le moment."
        />
        <TableauGroupe
          titre="Par code de parrainage"
          entete="Code"
          description="Liens avec ?ref=CODE : qui vous amène des clients (experts-comptables, partenaires)."
          lignes={parParrain(lignes)}
          vide="Aucune inscription par parrainage pour le moment."
        />
      </div>
    </div>
  );
}
