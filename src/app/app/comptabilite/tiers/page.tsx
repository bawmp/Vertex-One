import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Download, Lock, Users2 } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { dateDouala, periodePredefinie, type NomPeriode } from "@/lib/comptabilite/livres";
import { lireBalanceAgee, lireGrandLivreAuxiliaire, listerTiersAvecEcritures, TRANCHES_AGE, type BalanceAgee, type NatureTiers, type TiersGrandLivre } from "@/lib/comptabilite/tiers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PERIODES: { cle: NomPeriode; libelle: string }[] = [
  { cle: "mois", libelle: "Ce mois" },
  { cle: "trimestre", libelle: "Ce trimestre" },
  { cle: "annee", libelle: "Cette année" },
  { cle: "annee-derniere", libelle: "Année dernière" },
];
const LIMITE_LIGNES = 1000;
const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(d);
/** Garde au plus `limite` écritures au total sur l'ensemble des tiers, dans l'ordre. */
function limiter<G extends { lignes: unknown[] }>(groupes: G[], limite: number): G[] {
  let restant = limite;
  return groupes.map((g) => {
    const lignes = g.lignes.slice(0, Math.max(restant, 0));
    restant -= lignes.length;
    return { ...g, lignes };
  });
}
const montant = (v: number) => (v === 0 ? "" : formaterFCFA(v));
const solde = (v: number) => (v === 0 ? "0" : `${formaterFCFA(Math.abs(v))} ${v > 0 ? "D" : "C"}`);

export default async function PageTiers({ searchParams }: { searchParams: Promise<{ nature?: string; vue?: string; du?: string; au?: string; tiers?: string }> }) {
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

  const nature: NatureTiers = parametres.nature === "fournisseurs" ? "FOURNISSEUR" : "CLIENT";
  const vue: "livre" | "agee" = parametres.vue === "agee" ? "agee" : "livre";
  const defaut = periodePredefinie("annee", new Date());
  const duTexte = dateDouala(parametres.du, false) ? parametres.du! : defaut.du;
  const auTexte = dateDouala(parametres.au, true) ? parametres.au! : defaut.au;
  const du = dateDouala(duTexte, false)!;
  const au = dateDouala(auTexte, true)!;
  const periodeInversee = du > au;
  const tiersChoisi = parametres.tiers && /^[A-Za-z0-9_-]{1,64}$/.test(parametres.tiers) ? parametres.tiers : "";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    if (vue === "agee") return { liste: [], livre: null, agee: await lireBalanceAgee(tx, utilisateurConnecte.entrepriseId, nature) };
    return {
      liste: await listerTiersAvecEcritures(tx, utilisateurConnecte.entrepriseId, nature),
      livre: periodeInversee ? [] : await lireGrandLivreAuxiliaire(tx, utilisateurConnecte.entrepriseId, nature, { du, au }, tiersChoisi || undefined),
      agee: null,
    };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const natureUrl = nature === "CLIENT" ? "clients" : "fournisseurs";
  const lien = (n: string, v: string, du2 = duTexte, au2 = auTexte) => `/app/comptabilite/tiers?nature=${n}&vue=${v}&du=${du2}&au=${au2}${tiersChoisi && v === "livre" && n === natureUrl ? `&tiers=${tiersChoisi}` : ""}`;
  const lienExport = vue === "agee" ? `/app/comptabilite/livres/export?vue=agee-${natureUrl}` : `/app/comptabilite/livres/export?vue=${natureUrl}&du=${duTexte}&au=${auTexte}${tiersChoisi ? `&tiers=${tiersChoisi}` : ""}`;
  const mot = nature === "CLIENT" ? "client" : "fournisseur";

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la comptabilité
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <Users2 className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Clients et fournisseurs</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {vue === "livre"
            ? `Le compte de chaque ${mot}, écriture par écriture. Une lettre (A, B…) apparaît sur toutes les écritures d'une facture entièrement soldée.`
            : `Ce que chaque ${mot} ${nature === "CLIENT" ? "vous doit" : "attend de vous"} encore, classé par retard d'échéance.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choisir clients ou fournisseurs">
        {(["clients", "fournisseurs"] as const).map((n) => (
          <Link key={n} role="tab" aria-selected={n === natureUrl} href={lien(n, vue)} className={buttonVariants({ variant: n === natureUrl ? "default" : "outline", size: "sm" })}>
            {n === "clients" ? "Clients" : "Fournisseurs"}
          </Link>
        ))}
        <span className="mx-1 w-px bg-border" aria-hidden />
        {([["livre", "Grand livre auxiliaire"], ["agee", "Balance âgée"]] as const).map(([v, libelle]) => (
          <Link key={v} role="tab" aria-selected={v === vue} href={lien(natureUrl, v)} className={buttonVariants({ variant: v === vue ? "default" : "outline", size: "sm" })}>
            {libelle}
          </Link>
        ))}
      </div>

      {vue === "livre" ? (
        <Card className="p-4">
          <form method="get" className="flex flex-col gap-4">
            <input type="hidden" name="nature" value={natureUrl} />
            <input type="hidden" name="vue" value="livre" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Période rapide :</span>
              {PERIODES.map((p) => {
                const r = periodePredefinie(p.cle, new Date());
                return (
                  <Link key={p.cle} href={lien(natureUrl, "livre", r.du, r.au)} className={buttonVariants({ variant: r.du === duTexte && r.au === auTexte ? "secondary" : "ghost", size: "sm" })}>
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
              <div className="flex min-w-60 flex-col gap-1.5">
                <Label htmlFor="tiers">{nature === "CLIENT" ? "Client" : "Fournisseur"}</Label>
                <select id="tiers" name="tiers" defaultValue={tiersChoisi} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">{nature === "CLIENT" ? "Tous les clients" : "Tous les fournisseurs"}</option>
                  {donnees.liste.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Afficher</Button>
              <Link href={lienExport} prefetch={false} className={buttonVariants({ variant: "outline" })}>
                <Download data-icon="inline-start" aria-hidden />
                Exporter en CSV
              </Link>
            </div>
            {periodeInversee ? <p role="alert" className="text-sm text-destructive">La date de début doit être avant la date de fin.</p> : null}
          </form>
        </Card>
      ) : (
        <div>
          <Link href={lienExport} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download data-icon="inline-start" aria-hidden />
            Exporter en CSV
          </Link>
        </div>
      )}

      {vue === "livre" && donnees.livre ? <VueLivre tiers={donnees.livre} nature={nature} /> : null}
      {vue === "agee" && donnees.agee ? <VueAgee balance={donnees.agee} nature={nature} /> : null}
    </div>
  );
}

function VueLivre({ tiers, nature }: { tiers: TiersGrandLivre[]; nature: NatureTiers }) {
  if (tiers.length === 0) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune écriture sur cette période.</p>;
  const total = tiers.reduce((s, t) => s + t.lignes.length, 0);
  const limites = limiter(tiers, LIMITE_LIGNES);
  return (
    <div className="flex flex-col gap-4">
      {total > LIMITE_LIGNES ? <p className="text-sm text-muted-foreground">Affichage limité aux {LIMITE_LIGNES} premières écritures sur {total} : utilisez « Exporter en CSV » pour tout obtenir.</p> : null}
      {limites.map((t) => (
        <Card key={t.tiersId ?? t.nom} className="overflow-x-auto p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold">{t.nom}</h2>
            <span className="text-xs text-muted-foreground">Solde reporté : {solde(t.soldeOuverture)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Libellé</th>
                <th className="px-4 py-2 text-right font-medium">Débit</th>
                <th className="px-4 py-2 text-right font-medium">Crédit</th>
                <th className="px-4 py-2 text-right font-medium">Solde</th>
                <th className="px-4 py-2 font-medium">Lettrage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {t.lignes.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground">{jour(l.date)}</td>
                  <td className="px-4 py-1.5">{l.libelle}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.debit)}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.credit)}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-muted-foreground">{solde(l.soldeCumule)}</td>
                  <td className="px-4 py-1.5">{l.lettre ? <Badge variant="success">{l.lettre}</Badge> : null}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-4 py-2" colSpan={2}>
                  Total {nature === "CLIENT" ? "du client" : "du fournisseur"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(t.totalDebit)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(t.totalCredit)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{solde(t.soldeCloture)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">D = solde débiteur, C = solde créditeur. Une lettre identique sur plusieurs lignes veut dire qu&apos;elles se soldent entre elles (facture entièrement réglée).</p>
    </div>
  );
}

function VueAgee({ balance, nature }: { balance: BalanceAgee; nature: NatureTiers }) {
  if (balance.lignes.length === 0) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{nature === "CLIENT" ? "Aucune facture en attente de paiement : tout est réglé." : "Aucune facture fournisseur à payer."}</p>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">{nature === "CLIENT" ? "Client" : "Fournisseur"}</th>
            {TRANCHES_AGE.map((t) => (
              <th key={t} className="px-3 py-2 text-right font-medium">
                {t}
              </th>
            ))}
            <th className="px-4 py-2 text-right font-medium">Total dû</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {balance.lignes.map((l) => (
            <tr key={l.tiersId ?? l.nom} className="align-top">
              <td className="px-4 py-2">
                <p className="font-medium">{l.nom}</p>
                <p className="text-xs text-muted-foreground">{l.documents.map((d) => `${d.numero} (${jour(d.echeance)})`).join(" · ")}</p>
              </td>
              {TRANCHES_AGE.map((t) => (
                <td key={t} className={"whitespace-nowrap px-3 py-2 text-right tabular-nums" + (t !== "Non échu" && l.tranches[t] > 0 ? " font-medium text-destructive" : "")}>
                  {montant(l.tranches[t])}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">{formaterFCFA(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30 font-medium">
            <td className="px-4 py-2">Total</td>
            {TRANCHES_AGE.map((t) => (
              <td key={t} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formaterFCFA(balance.totaux[t])}
              </td>
            ))}
            <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(balance.total)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
