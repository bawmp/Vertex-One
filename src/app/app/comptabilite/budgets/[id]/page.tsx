import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { ArrowLeft, PiggyBank, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, budget, budgetLigne, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { calculerBalance } from "@/lib/comptabilite/etats-financiers";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Le "réalisé" par compte se calcule à la volée sur la période exacte du
// budget (calculerBalance(tx, entrepriseId, dateFin, dateDebut)) — jamais
// stocké, toujours à jour. Une classe 7 (produit) est créditrice par nature
// (solde négatif dans la convention débit - crédit) : inversé pour un
// réalisé positif, même convention que calculerCompteDeResultat().
export default async function PageDetailBudget({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité est réservée à l&apos;Administrateur.</p>
      </div>
    );
  }

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;

    const [leBudget] = await tx.select().from(budget).where(eq(budget.id, id));
    if (!leBudget) return null;

    const [lignes, balance] = await Promise.all([
      tx
        .select({ id: budgetLigne.id, montant: budgetLigne.montant, numero: compteComptable.numero, libelle: compteComptable.libelle, classe: compteComptable.classe })
        .from(budgetLigne)
        .innerJoin(compteComptable, eq(budgetLigne.compteId, compteComptable.id))
        .where(and(eq(budgetLigne.budgetId, id))),
      calculerBalance(tx, utilisateurConnecte.entrepriseId, leBudget.dateFin, leBudget.dateDebut),
    ]);

    const soldeParNumero = new Map(balance.map((l) => [l.numero, l.solde]));
    const lignesAvecRealise = lignes.map((l) => {
      const solde = soldeParNumero.get(l.numero) ?? 0;
      const realise = l.classe === 7 ? -solde : solde;
      return { ...l, realise, ecart: l.montant - realise };
    });

    return { leBudget, lignes: lignesAvecRealise };
  });

  if (!donnees) notFound();
  const { leBudget, lignes } = donnees;
  const totalBudgete = lignes.reduce((s, l) => s + l.montant, 0);
  const totalRealise = lignes.reduce((s, l) => s + l.realise, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite/budgets" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <PiggyBank className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{leBudget.nom}</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(leBudget.dateDebut)} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(leBudget.dateFin)}
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Compte</th>
              <th className="px-4 py-2 text-right font-medium">Budgété</th>
              <th className="px-4 py-2 text-right font-medium">Réalisé</th>
              <th className="px-4 py-2 text-right font-medium">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lignes.map((l) => {
              const depassement = l.classe === 7 ? l.realise < l.montant : l.realise > l.montant;
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    <span className="text-xs text-muted-foreground">{l.numero}</span> {l.libelle}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formaterFCFA(l.montant)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formaterFCFA(l.realise)}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", depassement ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    {formaterFCFA(l.ecart)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{formaterFCFA(totalBudgete)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formaterFCFA(totalRealise)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formaterFCFA(totalBudgete - totalRealise)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
