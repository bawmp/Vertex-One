import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Building2, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { Card } from "@/components/ui/card";
import { lireRegistre } from "@/lib/comptabilite/immobilisations";
import { exerciceDuBien } from "@/lib/comptabilite/immobilisations-regles";
import { moisDebutExercice } from "@/lib/comptabilite/cloture";
import { BoutonRetirer, FormulaireDotations, FormulaireImmobilisation } from "./formulaires";
import { getT } from "@/lib/i18n/langue";

export default async function PageImmobilisations() {
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

  const donneesImmo = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return null;
    const moisDebut = await moisDebutExercice(tx, utilisateurConnecte.entrepriseId);
    return { moisDebut, registre: await lireRegistre(tx, moisDebut) };
  });

  if (!donneesImmo) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }

  const { registre, moisDebut } = donneesImmo;
  const peutCreer = peut(utilisateurConnecte, "COMPTABILITE", "CREER");
  const peutModifier = peut(utilisateurConnecte, "COMPTABILITE", "MODIFIER");
  const maintenant = new Date();
  const anneeCourante = exerciceDuBien(maintenant, moisDebut).annee;
  const aujourdhui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Douala" }).format(maintenant);
  const premiere = registre.length > 0 ? Math.min(...registre.map((b) => exerciceDuBien(b.dateAcquisition, moisDebut).annee)) : anneeCourante;
  const annees: number[] = [];
  for (let a = anneeCourante; a >= Math.max(premiere, anneeCourante - 15); a--) annees.push(a);
  const anneeParDefaut = exerciceDuBien(maintenant, moisDebut).mois <= 3 ? anneeCourante - 1 : anneeCourante;

  const totalBrut = registre.reduce((s, b) => s + b.valeurAcquisition, 0);
  const totalAmort = registre.reduce((s, b) => s + b.amortissementsCumules, 0);
  const date = (d: Date) => new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeZone: "Africa/Douala" }).format(d);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>

      <div className="flex items-center gap-2.5">
        <Building2 className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Immobilisations et amortissements")}</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {t("Le registre de vos biens durables (matériel, mobilier, informatique, véhicules). Chaque année, une seule action passe en comptabilité la perte de valeur de tous les biens : le bilan et le résultat s'en trouvent justes.")}
      </p>

      {peutCreer ? <FormulaireImmobilisation aujourdhui={aujourdhui} moisDebut={moisDebut} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("Registre")}</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {registre.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.libelle}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(b.categorie)} · {t("acquis le {date}", { date: date(b.dateAcquisition) })} · {b.dureeAnnees > 1 ? t("{n} ans", { n: b.dureeAnnees }) : t("{n} an", { n: b.dureeAnnees })} · {t("dotations passées : {annees}", { annees: b.anneesPassees.length > 0 ? b.anneesPassees.join(", ") : t("aucune") })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right tabular-nums">
                    <p>{formaterFCFA(b.valeurNette)}</p>
                    <p className="text-xs text-muted-foreground">{t("sur {montant}", { montant: formaterFCFA(b.valeurAcquisition) })}</p>
                  </div>
                  {peutModifier && b.anneesPassees.length === 0 ? <BoutonRetirer id={b.id} /> : null}
                </div>
              </div>
            ))}
            {registre.length === 0 ? <p className="px-4 py-8 text-center text-muted-foreground">{t("Aucun bien enregistré pour le moment.")}</p> : null}
          </div>
          {registre.length > 0 ? (
            <div className="flex justify-between border-t px-4 py-3 text-sm font-medium tabular-nums">
              <span>{t("Valeur brute {montant}", { montant: formaterFCFA(totalBrut) })}</span>
              <span>{t("Amortissements {montant}", { montant: formaterFCFA(totalAmort) })}</span>
              <span>{t("Valeur nette {montant}", { montant: formaterFCFA(totalBrut - totalAmort) })}</span>
            </div>
          ) : null}
        </Card>
      </div>

      {peutCreer && registre.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="font-medium">{t("Passer les dotations de l'exercice")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("À faire une fois par exercice, avant la clôture. Écriture à la fin de l'exercice : charge « Dotations aux amortissements » (681000) en face des comptes d'amortissement. Sans risque de doublon : un bien déjà traité pour l'année est ignoré.")}
          </p>
          <FormulaireDotations annees={annees} anneeParDefaut={anneeParDefaut} />
        </Card>
      ) : null}
    </div>
  );
}
