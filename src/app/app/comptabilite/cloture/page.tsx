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
import { apercuCloture, dernierExerciceCloture, moisDebutExercice, exercicesConnus, listerReouvertures } from "@/lib/comptabilite/cloture";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonCloture } from "./bouton-cloture";
import { DebutExercice } from "./debut-exercice";
import { finExerciceTexte, debutExerciceTexte } from "@/lib/comptabilite/exercice-regles";
import { BoutonReouverture } from "./bouton-reouverture";
import { getT } from "@/lib/i18n/langue";


export default async function PageCloture() {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité est réservée à l'Administrateur.")}</p>
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
    return { moisDebut: await moisDebutExercice(tx, utilisateurConnecte.entrepriseId), apercus, verrou: monEntreprise.verrou, dernier: await dernierExerciceCloture(tx, utilisateurConnecte.entrepriseId), reouvertures: await listerReouvertures(tx, utilisateurConnecte.entrepriseId) };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }
  const jour = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeZone: "Africa/Douala" }).format(d);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour à la comptabilité")}
      </Link>
      <div>
        <div className="flex items-center gap-2.5">
          <LockKeyhole className="size-5" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">{t("Clôture d'exercice")}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("À la fin de l'année, la clôture solde vos charges et vos produits dans le résultat, reporte vos comptes de bilan sur l'exercice suivant et verrouille la comptabilité. Le dossier de votre expert-comptable se télécharge à tout moment.")}
        </p>
        {donnees.verrou ? <p className="mt-1 text-xs text-muted-foreground">{t("Comptabilité verrouillée jusqu'au {date}.", { date: jour(donnees.verrou) })}</p> : null}
      </div>

      <DebutExercice moisDebut={donnees.moisDebut} modifiable={peutCloturer && donnees.dernier === null} />

      {donnees.apercus.map((a) => (
        <Card key={a.annee} className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {t("Exercice {annee}", { annee: a.annee })}
              <span className="text-xs font-normal text-muted-foreground">{t("du {debut} au {fin}", { debut: debutExerciceTexte(a.annee, donnees.moisDebut), fin: finExerciceTexte(a.annee, donnees.moisDebut) })}</span>
              {a.dejaCloture ? <Badge variant="success">{t("Clôturé")}</Badge> : <Badge variant="neutral">{t("Ouvert")}</Badge>}
            </h2>
            <Link href={`/app/comptabilite/cloture/dossier?annee=${a.annee}`} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download data-icon="inline-start" aria-hidden />
              {t("Dossier de l'expert-comptable (ZIP)")}
            </Link>
          </div>
          <div className="flex flex-col gap-3 p-4 text-sm">
            {a.dejaCloture ? (
              <>
                <p className="flex items-center gap-2">
                  <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                  {t("Clôturé le {date} — {sens} de {montant}.", { date: jour(a.dejaCloture.dateCloture), sens: a.dejaCloture.resultatNet >= 0 ? t("bénéfice") : t("perte"), montant: formaterFCFA(Math.abs(a.dejaCloture.resultatNet)) })}
                </p>
                {peutCloturer && donnees.dernier === a.annee ? <BoutonReouverture annee={a.annee} /> : null}
              </>
            ) : (
              <>
                <dl className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("Produits")}</dt>
                    <dd className="tabular-nums">{formaterFCFA(a.produits)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("Charges")}</dt>
                    <dd className="tabular-nums">{formaterFCFA(a.charges)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t pt-1 font-medium">
                    <dt>{t("Résultat prévu ({sens})", { sens: a.plan.resultatNet >= 0 ? t("bénéfice") : t("perte") })}</dt>
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
                  <BoutonCloture annee={a.annee} fin={finExerciceTexte(a.annee, donnees.moisDebut)} resultat={t("{sens} de {montant}", { sens: a.plan.resultatNet >= 0 ? t("bénéfice") : t("perte"), montant: formaterFCFA(Math.abs(a.plan.resultatNet)) })} />
                ) : (
                  <p className="text-muted-foreground">{t("Seul l'Administrateur peut clôturer l'exercice.")}</p>
                )}
              </>
            )}
          </div>
        </Card>
      ))}

      {donnees.reouvertures.length > 0 ? (
        <Card className="p-0">
          <div className="border-b bg-muted/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold">{t("Historique des réouvertures")}</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            {donnees.reouvertures.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                <span className="font-medium">
                  {t("Exercice {annee} rouvert le {date} — résultat annulé : {sens} de {montant}", { annee: r.annee, date: jour(r.rouvertLe), sens: r.resultatAnnule >= 0 ? t("bénéfice") : t("perte"), montant: formaterFCFA(Math.abs(r.resultatAnnule)) })}
                </span>
                <span className="text-muted-foreground">{t("Motif : {motif}", { motif: r.motif })}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
