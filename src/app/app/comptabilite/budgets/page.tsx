import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, PiggyBank, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, budget, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { FormulaireBudget } from "./formulaire-budget";

// Zoho Books > Comptable > "Budgets" (échange du 2026-09-07) — pas de
// ventilation mensuelle (contrairement à Zoho) : un montant par compte sur
// toute la période du budget, comparé au réalisé calculé à la volée sur la
// fiche détail (voir [id]/page.tsx). Réservé à l'Administrateur.
export default async function PageBudgets() {
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

    const [budgets, comptes] = await Promise.all([
      tx.select().from(budget).orderBy(desc(budget.dateDebut)),
      tx.select({ id: compteComptable.id, numero: compteComptable.numero, libelle: compteComptable.libelle }).from(compteComptable).orderBy(compteComptable.numero),
    ]);

    return { budgets, comptes };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const { budgets, comptes } = donnees;
  const peutCreer = peut(utilisateurConnecte.role, "COMPTABILITE", "CREER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <PiggyBank className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
      </div>

      {peutCreer ? <FormulaireBudget comptes={comptes} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Historique</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {budgets.map((b) => (
              <Link key={b.id} href={`/app/comptabilite/budgets/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60">
                <span className="font-medium">{b.nom}</span>
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(b.dateDebut)} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(b.dateFin)}
                </span>
              </Link>
            ))}
            {budgets.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucun budget pour le moment.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
