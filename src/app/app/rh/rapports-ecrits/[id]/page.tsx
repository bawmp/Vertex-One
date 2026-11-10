import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCheck, Download, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { lireRapportPourPersonne } from "@/lib/rh/rapport-hierarchique";
import { MODELE_PAR_DEFAUT, rubriquesDuRapport, trouverModele } from "@/lib/rh/rapport-modeles";
import { LogoEntreprise } from "@/components/logo-entreprise";
import { Button } from "@/components/ui/button";
import { PastilleModele } from "../icones-modeles";
import { getT } from "@/lib/i18n/langue";

export default async function PageRapportEcrit({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const { id } = await params;

  const rapport = peut(utilisateurConnecte, "RH", "VOIR") ? await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => lireRapportPourPersonne(tx, utilisateurConnecte, id, { marquerLu: true })) : null;

  if (!rapport) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Ce rapport n'existe pas ou vous n'y avez pas accès.")}</p>
        <Link href="/app/rh/rapports-ecrits" className="text-sm underline">
          {t("Retour aux rapports")}
        </Link>
      </div>
    );
  }

  const e = rapport.entreprise;
  const modele = trouverModele(rapport.modele) ?? trouverModele(MODELE_PAR_DEFAUT)!;
  // Un rapport d'avant les modèles n'a pas de rubriques : on montre son texte tel quel.
  const rubriques = rubriquesDuRapport(rapport.modele, rapport.sections).map((r) => ({ ...r, libelle: r.libelle ? t(r.libelle) : null }));
  const lu = Boolean(rapport.luLe) || rapport.destinataireId === utilisateurConnecte.utilisateurId;
  const coordonnees = [e.adresse, e.ville].filter(Boolean).join(", ");
  const mentions = [e.niu ? `NIU ${e.niu}` : null, e.rccm ? `RCCM ${e.rccm}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/rh/rapports-ecrits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          {t("Rapports écrits")}
        </Link>
        <div className="flex items-center gap-2">
          {lu ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCheck className="size-3.5" aria-hidden />
              {t("Lu")}
            </span>
          ) : null}
          <Button variant="outline" size="sm" render={<a href={`/app/rh/rapports-ecrits/${id}/pdf`} target="_blank" rel="noopener" />} nativeButton={false}>
            <Download data-icon="inline-start" aria-hidden />
            {t("Télécharger le PDF")}
          </Button>
        </div>
      </div>

      {/* La feuille : papier à en-tête de l'entreprise (logo, coordonnées, filet aux couleurs de la marque), comme le PDF. */}
      <article className="animate-in overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5 duration-500 fade-in slide-in-from-bottom-3">
        <header className="flex flex-col gap-4 px-6 pt-6 pb-5 sm:flex-row sm:items-start sm:px-10 sm:pt-8">
          <LogoEntreprise entrepriseId={e.id} logoCleStockage={e.logoCleStockage} nomEntreprise={e.nom} taille="bandeau" className="shrink-0 shadow-none ring-0" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-lg font-semibold tracking-tight text-primary">{e.nom}</p>
            {coordonnees ? <p className="text-xs text-muted-foreground">{coordonnees}</p> : null}
            {mentions ? <p className="text-xs text-muted-foreground">{mentions}</p> : null}
          </div>
        </header>
        <div aria-hidden className="h-1 bg-linear-to-r from-primary via-primary to-marque-orange" />

        <div className="flex flex-col gap-6 px-6 py-7 sm:px-10 sm:py-9">
          <div className="flex items-start gap-3.5">
            <PastilleModele modele={modele} taille="grand" />
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">{t(modele.libelle)}</p>
              <h1 className="mt-0.5 text-2xl leading-tight font-semibold tracking-tight">{rapport.objet}</h1>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 border-y border-border py-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t("De")}</dt>
              <dd className="mt-1 font-semibold">{rapport.auteurNom}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t("À")}</dt>
              <dd className="mt-1 font-semibold">{rapport.destinataireNom}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t("Date")}</dt>
              <dd className="mt-1 font-semibold">{new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short" }).format(rapport.creeLe)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-5">
            {rubriques.length > 0 ? (
              rubriques.map((s, index) => (
                <section key={index} style={{ animationDelay: `${150 + index * 70}ms` }} className="animate-in duration-500 fade-in slide-in-from-bottom-2 fill-mode-both">
                  {s.libelle ? <h2 className="mb-1.5 text-xs font-semibold tracking-wider text-primary uppercase">{s.libelle}</h2> : null}
                  <p className={s.ligne ? "font-medium" : "text-sm leading-relaxed whitespace-pre-wrap"}>{s.texte}</p>
                </section>
              ))
            ) : (
              <p className="animate-in text-sm leading-relaxed whitespace-pre-wrap duration-500 fade-in">{rapport.contenu}</p>
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <p className="w-52 border-t border-muted-foreground/40 pt-1.5 text-center text-xs text-muted-foreground">{rapport.auteurNom}</p>
          </div>
        </div>

        <footer className="border-t border-border bg-muted/40 px-6 py-3 text-center text-[11px] text-muted-foreground sm:px-10">
          {[e.nom, coordonnees, mentions].filter(Boolean).join(" — ")} · {t("Document confidentiel")}
        </footer>
      </article>
    </div>
  );
}
