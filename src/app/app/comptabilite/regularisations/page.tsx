import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc, or, like } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise, journalManuel, compteComptable } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { REGULARISATIONS } from "@/lib/comptabilite/regularisations-regles";
import { FormulaireRegularisation } from "./formulaire-regularisation";

/** Date proposée : le 31 décembre de l'exercice qui vient de se terminer en début d'année (janvier à mars), sinon aujourd'hui (heure de Douala). */
function dateParDefaut(maintenant: Date): string {
  const [annee, mois] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Douala" }).format(maintenant).split("-").map(Number);
  if (mois <= 3) return `${annee - 1}-12-31`;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(maintenant);
}

export default async function PageRegularisations() {
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

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const [comptes, historique] = await Promise.all([
      tx.select({ numero: compteComptable.numero, libelle: compteComptable.libelle, classe: compteComptable.classe }).from(compteComptable).orderBy(compteComptable.numero),
      tx
        .select({ id: journalManuel.id, numero: journalManuel.numero, libelle: journalManuel.libelle, dateEcriture: journalManuel.dateEcriture })
        .from(journalManuel)
        .where(or(like(journalManuel.libelle, "Extourne — %"), ...REGULARISATIONS.map((d) => like(journalManuel.libelle, `${d.titre} au %`))))
        .orderBy(desc(journalManuel.dateEcriture))
        .limit(30),
    ]);
    return { comptes, historique };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }

  const peutCreer = peut(utilisateurConnecte, "COMPTABILITE", "CREER");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <CalendarClock className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Régularisations de fin d&apos;exercice</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Pour que le résultat de l&apos;année soit juste : rattachez à chaque exercice ce qui lui appartient, même si la facture ou le paiement arrive plus tard. Choisissez la situation, saisissez le montant : l&apos;écriture est préparée pour vous.
      </p>

      {peutCreer ? <FormulaireRegularisation comptes={donnees.comptes} dateParDefaut={dateParDefaut(new Date())} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Régularisations passées</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.historique.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <p className="min-w-0 truncate font-medium">
                  {j.numero} — {j.libelle}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Douala" }).format(j.dateEcriture)}</span>
              </div>
            ))}
            {donnees.historique.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">Aucune régularisation pour le moment.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
