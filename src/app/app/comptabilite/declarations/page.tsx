import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarCheck, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { aujourdhuiDouala } from "@/lib/facturation/promesse-regles";
import { dateDouala } from "@/lib/comptabilite/livres";
import { calculerTva, lireDeclarationTva } from "@/lib/comptabilite/tva";
import { listerDeclarationsTva } from "@/lib/comptabilite/declarations";
import { echeanceTva, estimerIS, lirePourcentage, moisEcoules, statutAffiche } from "@/lib/comptabilite/declarations-regles";
import { exercicesConnus, lignesExerciceSansCloture, moisDebutExercice } from "@/lib/comptabilite/cloture";
import { soldesDeGestion } from "@/lib/comptabilite/etats-donnees";
import { debutExerciceTexte, finExerciceTexte } from "@/lib/comptabilite/exercice-regles";
import { getT } from "@/lib/i18n/langue";
import { LigneDeclaration } from "./ligne-declaration";

const jourFr = (d: string) => d.split("-").reverse().join("/");

/**
 * Déclarations fiscales : suivi de la TVA mois par mois (échéance, statut, montant et récépissé saisis) et estimation indicative de
 * l'impôt sur les sociétés. Vertex One NE télédéclare PAS : les chiffres se reportent sur le portail de l'administration, avec l'aide
 * de votre comptable. Administrateur seul, forfait comptabilité complète.
 */
export default async function PageDeclarations({ searchParams }: { searchParams: Promise<{ exercice?: string; taux?: string; minimum?: string }> }) {
  const p = await searchParams;
  const t = await getT();
  const u = await recupererUtilisateurConnecte();
  if (!u) redirect("/connexion");
  if (!peut(u, "COMPTABILITE", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité est réservée à l'Administrateur.")}</p>
      </div>
    );
  }
  const aujourdhui = aujourdhuiDouala();
  const tauxIS = lirePourcentage(p.taux ?? "33") ?? 33;
  const minimumIS = lirePourcentage(p.minimum ?? "2") ?? 2;

  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!disponible(e, "COMPTABILITE_COMPLETE")) return null;
    const suivi = await listerDeclarationsTva(tx, u.entrepriseId);
    // Du plus ancien au plus récent, pour reporter le crédit de TVA d'un mois sur le suivant.
    const mois = moisEcoules(aujourdhui, 12).reverse();
    const lignes = [];
    let credit = 0;
    for (const m of mois) {
      const [a, mm] = [Number(m.slice(0, 4)), Number(m.slice(5, 7))];
      const dernier = new Date(Date.UTC(a, mm, 0)).getUTCDate();
      const du = dateDouala(`${m}-01`, false)!;
      const au = dateDouala(`${m}-${String(dernier).padStart(2, "0")}`, true)!;
      const d = await lireDeclarationTva(tx, u.entrepriseId, { du, au });
      const r = calculerTva(d.tvaCollectee, d.tvaDeductible, credit);
      credit = r.creditAReporter;
      lignes.push({ periode: m, d, r, suivi: suivi.get(m) ?? null });
    }
    const annees = await exercicesConnus(tx, u.entrepriseId);
    const demande = Number(p.exercice);
    const annee = annees.includes(demande) ? demande : annees[0];
    const moisDebut = await moisDebutExercice(tx, u.entrepriseId);
    const soldes = soldesDeGestion(await lignesExerciceSansCloture(tx, u.entrepriseId, annee));
    const resultat = -soldes.reduce((s, l) => s + l.solde, 0);
    const chiffreAffaires = -soldes.filter((l) => l.numero.startsWith("70")).reduce((s, l) => s + l.solde, 0);
    return { lignes: lignes.reverse(), annees, annee, moisDebut, resultat, chiffreAffaires };
  });
  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité complète est disponible à partir du forfait Business.")}</p>
      </div>
    );
  }
  const est = estimerIS({ resultat: donnees.resultat, chiffreAffaires: donnees.chiffreAffaires, tauxPourcent: tauxIS, minimumPourcent: minimumIS });
  const peutModifier = peut(u, "COMPTABILITE", "MODIFIER");
  const nomMois = (m: string) => new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <CalendarCheck className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Déclarations fiscales")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("Vertex One prépare les chiffres et suit vos échéances ; il ne télédéclare pas. Reportez les montants sur le portail de l'administration fiscale, avec l'aide de votre comptable, puis notez ici la déclaration et son récépissé.")}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("TVA mois par mois")}</h2>
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {donnees.lignes.map((l) => {
              const echeance = echeanceTva(l.periode)!;
              const statut = l.suivi?.statut ?? "A_FAIRE";
              return (
                <LigneDeclaration
                  key={l.periode}
                  periode={l.periode}
                  libelleMois={nomMois(l.periode)}
                  echeance={jourFr(echeance)}
                  collectee={formaterFCFA(l.d.tvaCollectee)}
                  deductible={formaterFCFA(l.d.tvaDeductible)}
                  aPayer={formaterFCFA(l.r.aPayer)}
                  credit={formaterFCFA(l.r.creditAReporter)}
                  affiche={statutAffiche(statut, echeance, aujourdhui)}
                  statut={statut}
                  montant={l.suivi?.montant ?? null}
                  reference={l.suivi?.reference ?? ""}
                  modifiable={peutModifier}
                />
              );
            })}
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          {t("Échéance retenue : le 15 du mois suivant.")}{" "}
          <Link href="/app/comptabilite/tva" className="underline-offset-4 hover:underline">{t("Détail et export de chaque mois")}</Link>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("Impôt sur les sociétés — estimation")}</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("Exercice")}
            <select name="exercice" defaultValue={donnees.annee} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              {donnees.annees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("Taux d'impôt (%)")}
            <input name="taux" defaultValue={String(tauxIS).replace(".", ",")} inputMode="decimal" className="h-10 w-28 rounded-lg border border-input bg-background px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("Minimum sur le chiffre d'affaires (%)")}
            <input name="minimum" defaultValue={String(minimumIS).replace(".", ",")} inputMode="decimal" className="h-10 w-28 rounded-lg border border-input bg-background px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
            {t("Calculer")}
          </button>
        </form>
        <Card className="flex flex-col gap-1.5 p-4 text-sm tabular-nums">
          <p className="text-xs text-muted-foreground">{t("Exercice du {debut} au {fin}", { debut: debutExerciceTexte(donnees.annee, donnees.moisDebut), fin: finExerciceTexte(donnees.annee, donnees.moisDebut) })}</p>
          <p>{t("Résultat comptable : {montant}", { montant: formaterFCFA(donnees.resultat) })}</p>
          <p>{t("Chiffre d'affaires : {montant}", { montant: formaterFCFA(donnees.chiffreAffaires) })}</p>
          <p>{t("Impôt sur le résultat : {montant}", { montant: formaterFCFA(est.impotSurResultat) })}</p>
          <p>{t("Minimum sur le chiffre d'affaires : {montant}", { montant: formaterFCFA(est.minimum) })}</p>
          <p className="text-base font-semibold">{t("Impôt estimé : {montant}", { montant: formaterFCFA(est.impot) })}{est.minimumApplique ? ` (${t("le minimum s'applique")})` : ""}</p>
        </Card>
        <p className="text-xs text-muted-foreground">{t("Estimation indicative : le résultat comptable tient lieu de résultat fiscal (aucune réintégration ni déduction) et les taux sont ceux que vous saisissez. Faites valider le calcul et les acomptes par votre comptable.")}</p>
      </section>
    </div>
  );
}
