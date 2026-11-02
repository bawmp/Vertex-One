import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download, Info, Lock, Percent } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { dateDouala, periodePredefinie, type NomPeriode } from "@/lib/comptabilite/livres";
import { calculerTva, lireDeclarationTva } from "@/lib/comptabilite/tva";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PERIODES: { cle: NomPeriode; libelle: string }[] = [
  { cle: "mois", libelle: "Ce mois" },
  { cle: "mois-dernier", libelle: "Mois dernier" },
  { cle: "trimestre", libelle: "Ce trimestre" },
  { cle: "annee", libelle: "Cette année" },
];
const LIMITE_LIGNES = 500;
const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(d);

export default async function PageTva({ searchParams }: { searchParams: Promise<{ du?: string; au?: string; report?: string }> }) {
  const parametres = await searchParams;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité est réservée à l&apos;Administrateur.</p>
      </div>
    );
  }

  const defaut = periodePredefinie("mois", new Date());
  const duTexte = dateDouala(parametres.du, false) ? parametres.du! : defaut.du;
  const auTexte = dateDouala(parametres.au, true) ? parametres.au! : defaut.au;
  const du = dateDouala(duTexte, false)!;
  const au = dateDouala(auTexte, true)!;
  const periodeInversee = du > au;
  const creditReporte = /^\d{1,12}$/.test(parametres.report ?? "") ? Number(parametres.report) : 0;

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement, assujettiTVA: entreprise.assujettiTVA })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    return { assujettie: monEntreprise.assujettiTVA, declaration: periodeInversee ? null : await lireDeclarationTva(tx, utilisateurConnecte.entrepriseId, { du, au }) };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const d = donnees.declaration;
  const resultat = d ? calculerTva(d.tvaCollectee, d.tvaDeductible, creditReporte) : null;
  const lien = (du2: string, au2: string) => `/app/comptabilite/tva?du=${du2}&au=${au2}${creditReporte ? `&report=${creditReporte}` : ""}`;
  const lienExport = `/app/comptabilite/livres/export?vue=tva&du=${duTexte}&au=${auTexte}${creditReporte ? `&report=${creditReporte}` : ""}`;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la comptabilité
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Percent className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Déclaration de TVA</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">La TVA que vous avez facturée, celle que vous pouvez déduire, et ce qu&apos;il reste à payer pour la période choisie.</p>
      </div>

      {!donnees.assujettie ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-600/20 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Votre entreprise est réglée comme non assujettie à la TVA (Paramètres → Entreprise) : vos factures n&apos;ajoutent pas de TVA, les montants ci-dessous sont normalement à zéro.
        </p>
      ) : null}

      <Card className="p-4">
        <form method="get" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Période rapide :</span>
            {PERIODES.map((p) => {
              const r = periodePredefinie(p.cle, new Date());
              return (
                <Link key={p.cle} href={lien(r.du, r.au)} className={buttonVariants({ variant: r.du === duTexte && r.au === auTexte ? "secondary" : "ghost", size: "sm" })}>
                  {p.libelle}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="du">Du</Label>
              <Input id="du" name="du" type="date" defaultValue={duTexte} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="au">Au</Label>
              <Input id="au" name="au" type="date" defaultValue={auTexte} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report">Crédit de TVA reporté (FCFA)</Label>
              <Input id="report" name="report" type="number" min={0} step={1} inputMode="numeric" defaultValue={creditReporte || ""} placeholder="0" className="w-52" />
            </div>
            <Button type="submit">Afficher</Button>
            <Link href={lienExport} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" aria-hidden />
              Exporter en CSV
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">Le crédit reporté est la TVA que l&apos;État vous doit déjà de la période précédente (ligne « Crédit de TVA à reporter » de votre dernière déclaration). Laissez vide s&apos;il n&apos;y en a pas.</p>
          {periodeInversee ? <p role="alert" className="text-sm text-destructive">La date de début doit être avant la date de fin.</p> : null}
        </form>
      </Card>

      {d && resultat ? (
        <>
          <Card className="p-0">
            <dl className="divide-y divide-border text-sm">
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt className="text-muted-foreground">Chiffre d&apos;affaires hors taxe</dt>
                <dd className="tabular-nums">{formaterFCFA(d.caHT)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt>TVA collectée (facturée à vos clients)</dt>
                <dd className="tabular-nums">{formaterFCFA(d.tvaCollectee)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-3">
                <dt>− TVA déductible (payée à vos fournisseurs)</dt>
                <dd className="tabular-nums">{formaterFCFA(d.tvaDeductible)}</dd>
              </div>
              {creditReporte > 0 ? (
                <div className="flex justify-between gap-3 px-4 py-3">
                  <dt>− Crédit de TVA reporté</dt>
                  <dd className="tabular-nums">{formaterFCFA(creditReporte)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 bg-muted/40 px-4 py-4 text-base font-semibold">
                <dt>{resultat.creditAReporter > 0 ? "Crédit de TVA à reporter" : "TVA à payer"}</dt>
                <dd className="tabular-nums">{formaterFCFA(resultat.creditAReporter > 0 ? resultat.creditAReporter : resultat.aPayer)}</dd>
              </div>
            </dl>
          </Card>
          <p className="text-xs text-muted-foreground">Tableau de travail à faire valider par votre comptable avant la déclaration officielle auprès de la DGI : Vertex One ne dépose aucune déclaration à votre place.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <DetailTva titre="TVA collectée" lignes={d.collectee} />
            <DetailTva titre="TVA déductible" lignes={d.deductible} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailTva({ titre, lignes }: { titre: string; lignes: { id: string; date: Date; libelle: string; montant: number }[] }) {
  const affichees = lignes.slice(0, LIMITE_LIGNES);
  return (
    <Card className="p-0">
      <div className="flex items-baseline justify-between border-b bg-muted/40 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <span className="text-xs text-muted-foreground">{lignes.length} écriture(s)</span>
      </div>
      {lignes.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune écriture sur cette période.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {affichees.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-1.5">
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{jour(l.date)}</span> {l.libelle}
              </span>
              <span className="shrink-0 tabular-nums">{formaterFCFA(l.montant)}</span>
            </li>
          ))}
        </ul>
      )}
      {lignes.length > LIMITE_LIGNES ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">Affichage limité aux {LIMITE_LIGNES} premières écritures : exportez en CSV pour tout obtenir.</p> : null}
    </Card>
  );
}
