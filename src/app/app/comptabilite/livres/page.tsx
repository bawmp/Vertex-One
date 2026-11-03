import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, BookMarked, CircleCheck, Download, Lock, TriangleAlert } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { compteComptable, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import {
  dateDouala,
  lireBalancePeriode,
  lireGrandLivre,
  lireJournaux,
  periodePredefinie,
  type BalancePeriode,
  type CompteGrandLivre,
  type JournalPeriode,
  type NomPeriode,
} from "@/lib/comptabilite/livres";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VUES = [
  { cle: "grand-livre", libelle: "Grand livre", aide: "Le détail de chaque compte, écriture par écriture, avec le solde qui évolue." },
  { cle: "balance", libelle: "Balance", aide: "Tous les comptes en un tableau : ce qu'il y avait au départ, ce qui a bougé, ce qu'il reste." },
  { cle: "journaux", libelle: "Journaux", aide: "Les écritures classées par type d'opération : ventes, achats, trésorerie, opérations diverses." },
] as const;
type CleVue = (typeof VUES)[number]["cle"];

const PERIODES: { cle: NomPeriode; libelle: string }[] = [
  { cle: "mois", libelle: "Ce mois" },
  { cle: "trimestre", libelle: "Ce trimestre" },
  { cle: "annee", libelle: "Cette année" },
  { cle: "annee-derniere", libelle: "Année dernière" },
];

const LIMITE_LIGNES = 1000;
const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Africa/Douala" }).format(d);
/** Garde au plus `limite` écritures au total sur l'ensemble des groupes (compte ou journal), dans l'ordre. */
function limiter<G extends { lignes: unknown[] }>(groupes: G[], limite: number): G[] {
  let restant = limite;
  return groupes.map((g) => {
    const lignes = g.lignes.slice(0, Math.max(restant, 0));
    restant -= lignes.length;
    return { ...g, lignes };
  });
}
const montant = (v: number) => (v === 0 ? "" : formaterFCFA(v));
/** Un solde s'affiche avec son sens : « D » débiteur, « C » créditeur. */
const solde = (v: number) => (v === 0 ? "0" : `${formaterFCFA(Math.abs(v))} ${v > 0 ? "D" : "C"}`);

export default async function PageLivresComptables({ searchParams }: { searchParams: Promise<{ vue?: string; du?: string; au?: string; compte?: string }> }) {
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

  const vue: CleVue = (VUES.find((v) => v.cle === parametres.vue)?.cle ?? "grand-livre") as CleVue;
  const defaut = periodePredefinie("annee", new Date());
  const duTexte = dateDouala(parametres.du, false) ? parametres.du! : defaut.du;
  const auTexte = dateDouala(parametres.au, true) ? parametres.au! : defaut.au;
  const du = dateDouala(duTexte, false)!;
  const au = dateDouala(auTexte, true)!;
  const periodeInversee = du > au;
  const compteChoisi = /^\d{1,10}$/.test(parametres.compte ?? "") ? parametres.compte! : "";

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const comptes = await tx.select({ numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).orderBy(compteComptable.numero);
    if (periodeInversee) return { comptes, grandLivre: null, balance: null, journaux: null };
    const periode = { du, au };
    return {
      comptes,
      grandLivre: vue === "grand-livre" ? await lireGrandLivre(tx, utilisateurConnecte.entrepriseId, periode, compteChoisi || undefined) : null,
      balance: vue === "balance" ? await lireBalancePeriode(tx, utilisateurConnecte.entrepriseId, periode) : null,
      journaux: vue === "journaux" ? await lireJournaux(tx, utilisateurConnecte.entrepriseId, periode) : null,
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

  const lien = (v: CleVue, du2 = duTexte, au2 = auTexte, compte = compteChoisi) => `/app/comptabilite/livres?vue=${v}&du=${du2}&au=${au2}${compte && v === "grand-livre" ? `&compte=${compte}` : ""}`;
  const lienExport = `/app/comptabilite/livres/export?vue=${vue}&du=${duTexte}&au=${auTexte}${compteChoisi && vue === "grand-livre" ? `&compte=${compteChoisi}` : ""}`;
  const vueActive = VUES.find((v) => v.cle === vue)!;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la comptabilité
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <BookMarked className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Livres comptables</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{vueActive.aide}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choisir un livre">
        {VUES.map((v) => (
          <Link key={v.cle} role="tab" aria-selected={v.cle === vue} href={lien(v.cle)} className={buttonVariants({ variant: v.cle === vue ? "default" : "outline", size: "sm" })}>
            {v.libelle}
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-col gap-4">
          <input type="hidden" name="vue" value={vue} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Période rapide :</span>
            {PERIODES.map((p) => {
              const r = periodePredefinie(p.cle, new Date());
              return (
                <Link key={p.cle} href={lien(vue, r.du, r.au)} className={buttonVariants({ variant: r.du === duTexte && r.au === auTexte ? "secondary" : "ghost", size: "sm" })}>
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
            {vue === "grand-livre" ? (
              <div className="flex min-w-64 flex-col gap-1.5">
                <Label htmlFor="compte">Compte</Label>
                <select id="compte" name="compte" defaultValue={compteChoisi} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">Tous les comptes mouvementés</option>
                  {donnees.comptes.map((c) => (
                    <option key={c.numero} value={c.numero}>
                      {c.numero} — {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button type="submit">Afficher</Button>
            <Link href={lienExport} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" aria-hidden />
              Exporter en CSV
            </Link>
            <Link href={`/app/comptabilite/livres/export?vue=ecritures&format=sage&du=${duTexte}&au=${auTexte}`} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" aria-hidden />
              Pour Sage
            </Link>
            <Link href={`/app/comptabilite/livres/export?vue=ecritures&format=ciel&du=${duTexte}&au=${auTexte}`} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" aria-hidden />
              Pour Ciel
            </Link>
            <Link href={`/app/comptabilite/livres/export?vue=ecritures&format=fec&du=${duTexte}&au=${auTexte}`} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              <Download data-icon="inline-start" aria-hidden />
              Fichier des écritures
            </Link>
          </div>
          {periodeInversee ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlert className="size-4" aria-hidden />
              La date de début doit être avant la date de fin.
            </p>
          ) : null}
        </form>
      </Card>

      {periodeInversee ? null : vue === "grand-livre" && donnees.grandLivre ? <VueGrandLivre comptes={donnees.grandLivre} /> : vue === "balance" && donnees.balance ? <VueBalance balance={donnees.balance} /> : vue === "journaux" && donnees.journaux ? <VueJournaux journaux={donnees.journaux} /> : null}
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{texte}</p>;
}

function VueGrandLivre({ comptes }: { comptes: CompteGrandLivre[] }) {
  if (comptes.length === 0) return <Vide texte="Aucune écriture sur cette période." />;
  const total = comptes.reduce((s, c) => s + c.lignes.length, 0);
  const limites = limiter(comptes, LIMITE_LIGNES);
  return (
    <div className="flex flex-col gap-4">
      {total > LIMITE_LIGNES ? <p className="text-sm text-muted-foreground">Affichage limité aux {LIMITE_LIGNES} premières écritures sur {total} : utilisez « Exporter en CSV » pour tout obtenir.</p> : null}
      {limites.map((c) => {
        const affichees = c.lignes;
        return (
          <Card key={c.numero} className="overflow-x-auto p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold">
                {c.numero} — {c.libelle}
              </h2>
              <span className="text-xs text-muted-foreground">Solde reporté : {solde(c.soldeOuverture)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Libellé</th>
                  <th className="px-4 py-2 text-right font-medium">Débit</th>
                  <th className="px-4 py-2 text-right font-medium">Crédit</th>
                  <th className="px-4 py-2 text-right font-medium">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {affichees.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground">{jour(l.date)}</td>
                    <td className="px-4 py-1.5">{l.libelle}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.debit)}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.credit)}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-muted-foreground">{solde(l.soldeCumule)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-4 py-2" colSpan={2}>
                    Total du compte
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(c.totalDebit)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(c.totalCredit)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{solde(c.soldeCloture)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">D = solde débiteur, C = solde créditeur.</p>
    </div>
  );
}

function VueBalance({ balance }: { balance: BalancePeriode }) {
  if (balance.lignes.length === 0) return <Vide texte="Aucune écriture sur cette période." />;
  const t = balance.totaux;
  return (
    <div className="flex flex-col gap-3">
      {balance.equilibree ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          Comptabilité équilibrée : total débit = total crédit.
        </p>
      ) : (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          Attention : le total des débits ne correspond pas au total des crédits. Faites vérifier vos écritures par votre comptable.
        </p>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th rowSpan={2} className="px-4 py-2 text-left font-medium">
                Compte
              </th>
              <th colSpan={2} className="border-l px-4 py-1.5 text-center font-medium">
                Ouverture
              </th>
              <th colSpan={2} className="border-l px-4 py-1.5 text-center font-medium">
                Mouvements
              </th>
              <th colSpan={2} className="border-l px-4 py-1.5 text-center font-medium">
                Clôture
              </th>
            </tr>
            <tr className="border-b text-xs text-muted-foreground">
              {["Débit", "Crédit", "Débit", "Crédit", "Débit", "Crédit"].map((e, i) => (
                <th key={i} className={"px-4 py-1.5 text-right font-medium" + (i % 2 === 0 ? " border-l" : "")}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {balance.lignes.map((l) => (
              <tr key={l.numero}>
                <td className="px-4 py-1.5">
                  <span className="text-muted-foreground">{l.numero}</span> {l.libelle}
                </td>
                {[l.ouvertureDebit, l.ouvertureCredit, l.mouvementDebit, l.mouvementCredit, l.clotureDebit, l.clotureCredit].map((v, i) => (
                  <td key={i} className={"whitespace-nowrap px-4 py-1.5 text-right tabular-nums" + (i % 2 === 0 ? " border-l" : "")}>
                    {montant(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-4 py-2">Total</td>
              {[t.ouvertureDebit, t.ouvertureCredit, t.mouvementDebit, t.mouvementCredit, t.clotureDebit, t.clotureCredit].map((v, i) => (
                <td key={i} className={"whitespace-nowrap px-4 py-2 text-right tabular-nums" + (i % 2 === 0 ? " border-l" : "")}>
                  {formaterFCFA(v)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

function VueJournaux({ journaux }: { journaux: JournalPeriode[] }) {
  const total = journaux.reduce((s, j) => s + j.lignes.length, 0);
  if (total === 0) return <Vide texte="Aucune écriture sur cette période." />;
  const limites = limiter(journaux, LIMITE_LIGNES);
  return (
    <div className="flex flex-col gap-4">
      {total > LIMITE_LIGNES ? <p className="text-sm text-muted-foreground">Affichage limité aux {LIMITE_LIGNES} premières écritures sur {total} : utilisez « Exporter en CSV » pour tout obtenir.</p> : null}
      {limites
        .map((j, i) => ({ j, i }))
        .filter(({ i }) => journaux[i].lignes.length > 0)
        .map(({ j }) => {
          const affichees = j.lignes;
          return (
            <Card key={j.code} className="overflow-x-auto p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <h2 className="text-sm font-semibold">
                  {j.libelle} <span className="font-normal text-muted-foreground">({j.code})</span>
                </h2>
                <span className="text-xs text-muted-foreground">{journaux.find((o) => o.code === j.code)!.lignes.length} écriture(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Libellé</th>
                    <th className="px-4 py-2 font-medium">Compte</th>
                    <th className="px-4 py-2 text-right font-medium">Débit</th>
                    <th className="px-4 py-2 text-right font-medium">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {affichees.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground">{jour(l.date)}</td>
                      <td className="px-4 py-1.5">{l.libelle}</td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground">
                        {l.numeroCompte} — {l.libelleCompte}
                      </td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.debit)}</td>
                      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-4 py-2" colSpan={3}>
                      Total du journal
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(j.totalDebit)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(j.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          );
        })}
    </div>
  );
}
