import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Layers, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { depense, ecritureComptable, entreprise, facture } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EtatVide } from "@/components/etat-vide";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { dateDouala, periodePredefinie } from "@/lib/comptabilite/livres";
import { listerSections, lireResultatAnalytique } from "@/lib/comptabilite/analytique";
import { LIBELLES_AXE } from "@/lib/comptabilite/analytique-regles";
import { getT } from "@/lib/i18n/langue";
import { BasculeSection, FormulaireSection, SelecteurSection } from "./formulaires";

/**
 * Comptabilité analytique : lire le résultat par projet, par agence ou par département, sans changer le plan comptable. Une section
 * est une étiquette posée sur les écritures d'un document (facture, dépense) ; les règlements la suivent. Administrateur seul.
 */
export default async function PageAnalytique({ searchParams }: { searchParams: Promise<{ du?: string; au?: string }> }) {
  const { du: duParam, au: auParam } = await searchParams;
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
  const defaut = periodePredefinie("annee", new Date());
  const duTexte = duParam ?? defaut.du;
  const auTexte = auParam ?? defaut.au;
  const du = dateDouala(duTexte, false);
  const au = dateDouala(auTexte, true);
  const periodeOk = du && au && du <= au;

  const donnees = await avecEntreprise(u.entrepriseId, async (tx) => {
    const [e] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, u.entrepriseId));
    if (!disponible(e, "COMPTABILITE_COMPLETE")) return null;
    const sections = await listerSections(tx, u.entrepriseId);
    const resultat = periodeOk ? await lireResultatAnalytique(tx, u.entrepriseId, { du, au }) : null;
    const affectees = async (colonne: typeof ecritureComptable.factureId | typeof ecritureComptable.depenseId) =>
      new Map((await tx.selectDistinct({ doc: colonne, s: ecritureComptable.sectionAnalytiqueId }).from(ecritureComptable).where(sql`${colonne} is not null and ${ecritureComptable.sectionAnalytiqueId} is not null`)).map((l) => [l.doc as string, l.s as string]));
    const [factures, depenses, parFacture, parDepense] = await Promise.all([
      tx.select({ id: facture.id, numero: facture.numero, montantHT: facture.montantHT }).from(facture).orderBy(desc(facture.dateEmission)).limit(30),
      tx.select({ id: depense.id, libelle: depense.libelle, montantHT: depense.montantHT }).from(depense).orderBy(desc(depense.creeLe)).limit(30),
      affectees(ecritureComptable.factureId),
      affectees(ecritureComptable.depenseId),
    ]);
    return { sections, resultat, factures, depenses, parFacture, parDepense };
  });
  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("La comptabilité complète est disponible à partir du forfait Business.")}</p>
      </div>
    );
  }
  const { sections, resultat, factures, depenses, parFacture, parDepense } = donnees;
  const actives = sections.filter((s) => s.actif);
  const peutModifier = peut(u, "COMPTABILITE", "MODIFIER");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/app/comptabilite" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Retour")}
      </Link>
      <div className="flex items-center gap-2.5">
        <Layers className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{t("Comptabilité analytique")}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{t("Suivez le résultat par projet, par agence ou par département. Rattachez une facture ou une dépense à une section : ses règlements la suivent. Le plan comptable ne change pas.")}</p>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("Du")}
          <input type="date" name="du" defaultValue={duTexte} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("Au")}
          <input type="date" name="au" defaultValue={auTexte} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" />
        </label>
        <button type="submit" className="h-10 rounded-lg border border-input px-4 text-sm font-medium hover:bg-muted">
          {t("Afficher")}
        </button>
      </form>

      {!periodeOk ? (
        <p role="alert" className="text-sm text-destructive">{t("La date de début doit être avant la date de fin.")}</p>
      ) : resultat && resultat.lignes.length > 0 ? (
        <Card className="p-0">
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-x-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t("Section")}</span>
            <span className="text-right">{t("Produits")}</span>
            <span className="text-right">{t("Charges")}</span>
            <span className="text-right">{t("Résultat")}</span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {resultat.lignes.map((r) => (
              <div key={r.section ?? "aucune"} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm tabular-nums sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] sm:gap-x-4">
                <span className="min-w-0 font-medium">{r.section ? `${r.code} — ${r.libelle}` : t("Non affecté")}</span>
                <span className="grid grid-cols-3 gap-2 text-xs sm:contents sm:text-sm">
                  <span className="sm:text-right"><span className="block text-muted-foreground sm:hidden">{t("Produits")}</span>{formaterFCFA(r.produits)}</span>
                  <span className="sm:text-right"><span className="block text-muted-foreground sm:hidden">{t("Charges")}</span>{formaterFCFA(r.charges)}</span>
                  <span className={`font-medium sm:text-right ${r.resultat < 0 ? "text-destructive" : ""}`}><span className="block font-normal text-muted-foreground sm:hidden">{t("Résultat")}</span>{formaterFCFA(r.resultat)}</span>
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-1.5 bg-muted/40 px-4 py-2.5 text-sm font-semibold tabular-nums sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] sm:gap-x-4">
              <span>{t("Total")}</span>
              <span className="grid grid-cols-3 gap-2 text-xs sm:contents sm:text-sm">
                <span className="sm:text-right">{formaterFCFA(resultat.totalProduits)}</span>
                <span className="sm:text-right">{formaterFCFA(resultat.totalCharges)}</span>
                <span className="sm:text-right">{formaterFCFA(resultat.totalProduits - resultat.totalCharges)}</span>
              </span>
            </div>
          </div>
        </Card>
      ) : (
        <EtatVide icone={Layers} titre={t("Aucune écriture sur cette période.")} description={t("Créez une section puis rattachez-y des factures ou des dépenses.")} />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("Sections")}</h2>
        {peut(u, "COMPTABILITE", "CREER") ? <FormulaireSection /> : null}
        {sections.length > 0 ? (
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {sections.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{s.code} — {s.libelle}</p>
                    <p className="text-xs text-muted-foreground">{t(LIBELLES_AXE[s.axe])} · {t("{n} écriture(s)", { n: s.nbEcritures })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.actif ? <Badge variant="success">{t("Active")}</Badge> : <Badge variant="neutral">{t("Désactivée")}</Badge>}
                    {peutModifier ? <BasculeSection id={s.id} libelle={s.libelle} actif={s.actif} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </section>

      {peutModifier && actives.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("Rattacher des documents")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-0">
              <p className="border-b px-4 py-2 text-sm font-medium">{t("Dernières factures")}</p>
              <div className="flex flex-col divide-y divide-border">
                {factures.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.numero} · {formaterFCFA(f.montantHT)}</span>
                    <SelecteurSection type="FACTURE" documentId={f.id} courante={parFacture.get(f.id) ?? ""} sections={actives} />
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-0">
              <p className="border-b px-4 py-2 text-sm font-medium">{t("Dernières dépenses")}</p>
              <div className="flex flex-col divide-y divide-border">
                {depenses.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.libelle} · {formaterFCFA(d.montantHT)}</span>
                    <SelecteurSection type="DEPENSE" documentId={d.id} courante={parDepense.get(d.id) ?? ""} sections={actives} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  );
}
