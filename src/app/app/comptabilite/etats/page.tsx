import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, FileText, Lock, TriangleAlert } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { exercicesConnus } from "@/lib/comptabilite/cloture";
import { lireEtatsFinanciers } from "@/lib/comptabilite/etats-donnees";
import type { SectionEtat } from "@/lib/comptabilite/etats-syscohada";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { finExerciceTexte } from "@/lib/comptabilite/exercice-regles";
import { getT } from "@/lib/i18n/langue";

const montant = (v: number) => (v === 0 ? "" : formaterFCFA(v));

export default async function PageEtatsFinanciers({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const t = await getT();
  const parametres = await searchParams;
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

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const annees = await exercicesConnus(tx, utilisateurConnecte.entrepriseId);
    const demandee = Number(parametres.annee);
    const annee = annees.includes(demandee) ? demandee : annees[0];
    return { annees, etats: await lireEtatsFinanciers(tx, utilisateurConnecte.entrepriseId, annee) };
  });

  if (!donnees || !donnees.etats) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité complète est disponible à partir du forfait Business.")}</p>
      </div>
    );
  }
  const { etats, annees } = donnees;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour à la comptabilité")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <FileText className="size-5" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">{t("États financiers")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("Le bilan et le compte de résultat de l'exercice, présentés par rubriques SYSCOHADA.")}</p>
        </div>
        <Link href={`/app/comptabilite/etats/pdf?annee=${etats.annee}`} prefetch={false} target="_blank" className={buttonVariants({ variant: "outline" })}>
          <FileText data-icon="inline-start" aria-hidden />
          {t("Télécharger le PDF")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("Choisir l'exercice")}>
        {annees.map((a) => (
          <Link key={a} role="tab" aria-selected={a === etats.annee} href={`/app/comptabilite/etats?annee=${a}`} className={buttonVariants({ variant: a === etats.annee ? "default" : "outline", size: "sm" })}>
            {t("Exercice {annee}", { annee: a })}
          </Link>
        ))}
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-amber-600/20 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("Brouillon généré à partir de vos écritures : à faire valider par votre comptable avant tout dépôt. Ce n'est pas la liasse fiscale complète (annexes, tableau des flux).")}
      </p>

      {etats.bilan.equilibre ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {t("Le bilan est équilibré : total actif = total passif.")}
        </p>
      ) : (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          {t("L'actif et le passif ne s'équilibrent pas : faites vérifier vos écritures par votre comptable.")}
        </p>
      )}

      <Section titre={t("Bilan — Actif au {fin}", { fin: finExerciceTexte(etats.annee, etats.moisDebut) })} sections={etats.bilan.actif} avecAmort total={etats.bilan.totalActif} totalLibelle={t("TOTAL ACTIF")} />
      <Section titre={t("Bilan — Passif au {fin}", { fin: finExerciceTexte(etats.annee, etats.moisDebut) })} sections={etats.bilan.passif} avecAmort={false} total={etats.bilan.totalPassif} totalLibelle={t("TOTAL PASSIF")} />

      <Card className="overflow-x-auto p-0">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t("Compte de résultat — exercice {annee}", { annee: etats.annee })}</h2>
        </div>
        {etats.resultat.lignes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Aucune écriture de gestion sur cet exercice.")}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {etats.resultat.lignes.map((l) => (
                <tr key={l.code} className={l.solde ? "bg-muted/30 font-semibold" : ""}>
                  <td className="w-12 px-4 py-1.5 text-xs text-muted-foreground">{l.code}</td>
                  <td className="px-2 py-1.5">{l.libelle}</td>
                  <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{formaterFCFA(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

async function Section({ titre, sections, avecAmort, total, totalLibelle }: { titre: string; sections: SectionEtat[]; avecAmort: boolean; total: number; totalLibelle: string }) {
  const t = await getT();
  return (
    <Card className="overflow-x-auto p-0">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titre}</h2>
      </div>
      {sections.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Rien à présenter.")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">{t("Réf.")}</th>
              <th className="px-2 py-2 font-medium">{t("Libellé")}</th>
              {avecAmort ? <th className="px-4 py-2 text-right font-medium">{t("Brut")}</th> : null}
              {avecAmort ? <th className="px-4 py-2 text-right font-medium">{t("Amortissements")}</th> : null}
              <th className="px-4 py-2 text-right font-medium">{avecAmort ? t("Net") : t("Montant")}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <SectionLignes key={s.titre} s={s} avecAmort={avecAmort} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-4 py-2" />
              <td className="px-2 py-2">{totalLibelle}</td>
              {avecAmort ? <td /> : null}
              {avecAmort ? <td /> : null}
              <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formaterFCFA(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
}

function SectionLignes({ s, avecAmort }: { s: SectionEtat; avecAmort: boolean }) {
  return (
    <>
      <tr className="bg-muted/20">
        <td colSpan={avecAmort ? 5 : 3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {s.titre}
        </td>
      </tr>
      {s.lignes.map((l) => (
        <tr key={l.code} className="border-b border-border">
          <td className="w-12 px-4 py-1.5 text-xs text-muted-foreground">{l.code}</td>
          <td className="px-2 py-1.5">{l.libelle}</td>
          {avecAmort ? <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.brut)}</td> : null}
          {avecAmort ? <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.amort)}</td> : null}
          <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">{montant(l.net)}</td>
        </tr>
      ))}
    </>
  );
}
