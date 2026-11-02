import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, Download, Lock, LockKeyhole, TriangleAlert } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { apercuCloture, exercicesConnus } from "@/lib/comptabilite/cloture";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonCloture } from "./bouton-cloture";
import { getT } from "@/lib/i18n/langue";

export default async function PageCloture() {
  const t = await getT();
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

  const peutCloturer = peut(utilisateurConnecte, "COMPTABILITE", "CREER") && peut(utilisateurConnecte, "COMPTABILITE", "MODIFIER");
  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement, verrou: entreprise.dateVerrouillageComptable }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const annees = await exercicesConnus(tx, utilisateurConnecte.entrepriseId);
    const apercus = [];
    for (const a of annees) {
      const ap = await apercuCloture(tx, utilisateurConnecte.entrepriseId, a);
      if (ap) apercus.push(ap);
    }
    return { apercus, verrou: monEntreprise.verrou };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">La comptabilité complète est disponible à partir du forfait Business.</p>
      </div>
    );
  }
  const jour = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Douala" }).format(d);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la comptabilité
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <LockKeyhole className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Clôture d&apos;exercice</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          À la fin de l&apos;année, la clôture solde vos charges et vos produits dans le résultat, reporte vos comptes de bilan sur l&apos;exercice suivant et verrouille la comptabilité. Le dossier de votre expert-comptable se télécharge à tout moment.
        </p>
        {donnees.verrou ? <p className="mt-1 text-xs text-muted-foreground">Comptabilité verrouillée jusqu&apos;au {jour(donnees.verrou)}.</p> : null}
      </div>

      {donnees.apercus.map((a) => (
        <Card key={a.annee} className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Exercice {a.annee}
              {a.dejaCloture ? <Badge variant="success">Clôturé</Badge> : <Badge variant="neutral">Ouvert</Badge>}
            </h2>
            <Link href={`/app/comptabilite/cloture/dossier?annee=${a.annee}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download data-icon="inline-start" aria-hidden />
              Dossier de l&apos;expert-comptable (ZIP)
            </Link>
          </div>
          <div className="flex flex-col gap-3 p-4 text-sm">
            {a.dejaCloture ? (
              <p className="flex items-center gap-2">
                <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                Clôturé le {jour(a.dejaCloture.dateCloture)} — {a.dejaCloture.resultatNet >= 0 ? "bénéfice" : "perte"} de {formaterFCFA(Math.abs(a.dejaCloture.resultatNet))}.
              </p>
            ) : (
              <>
                <dl className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Produits</dt>
                    <dd className="tabular-nums">{formaterFCFA(a.produits)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Charges</dt>
                    <dd className="tabular-nums">{formaterFCFA(a.charges)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t pt-1 font-medium">
                    <dt>Résultat prévu ({a.plan.resultatNet >= 0 ? "bénéfice" : "perte"})</dt>
                    <dd className="tabular-nums">{formaterFCFA(Math.abs(a.plan.resultatNet))}</dd>
                  </div>
                </dl>
                {a.obstacles.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {a.obstacles.map((o) => (
                      <li key={o} className="flex items-start gap-2 rounded-lg border border-amber-600/20 bg-amber-50 p-2.5 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {t(o)}
                      </li>
                    ))}
                  </ul>
                ) : peutCloturer ? (
                  <BoutonCloture annee={a.annee} resultat={`${a.plan.resultatNet >= 0 ? "bénéfice" : "perte"} de ${formaterFCFA(Math.abs(a.plan.resultatNet))}`} />
                ) : (
                  <p className="text-muted-foreground">Seul l&apos;Administrateur peut clôturer l&apos;exercice.</p>
                )}
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
