import { redirect } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft, FileText, Inbox, Lock, Plus, Send } from "lucide-react";
import { cn } from "cn";
import { avecEntreprise } from "@/db/client";
import { entreprise, rapportHierarchique, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { destinatairesPossibles } from "@/lib/rh/rapport-hierarchique";
import { MODELES_RAPPORT, trouverModele } from "@/lib/rh/rapport-modeles";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { Button } from "@/components/ui/button";
import { PastilleModele } from "./icones-modeles";
import { getT } from "@/lib/i18n/langue";

export default async function PageRapportsEcrits({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "RH", "VOIR")) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Vous n'avez pas accès aux Ressources Humaines.")}</p>
      </div>
    );
  }

  const { vue } = await searchParams;
  const vueEnvoyes = vue === "envoyes";

  const auteur = alias(utilisateur, "auteur");
  const destinataire = alias(utilisateur, "destinataire");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "RH")) return null;

    // Seuls l'auteur et le destinataire lisent un rapport : le filtre porte sur l'utilisateur de la session, jamais sur une valeur du navigateur.
    const rapports = await tx
      .select({
        id: rapportHierarchique.id,
        objet: rapportHierarchique.objet,
        modele: rapportHierarchique.modele,
        creeLe: rapportHierarchique.creeLe,
        luLe: rapportHierarchique.luLe,
        auteurNom: auteur.nomComplet,
        destinataireNom: destinataire.nomComplet,
      })
      .from(rapportHierarchique)
      .innerJoin(auteur, eq(rapportHierarchique.auteurId, auteur.id))
      .innerJoin(destinataire, eq(rapportHierarchique.destinataireId, destinataire.id))
      .where(
        and(
          eq(rapportHierarchique.entrepriseId, utilisateurConnecte.entrepriseId),
          vueEnvoyes ? eq(rapportHierarchique.auteurId, utilisateurConnecte.utilisateurId) : eq(rapportHierarchique.destinataireId, utilisateurConnecte.utilisateurId),
        ),
      )
      .orderBy(desc(rapportHierarchique.creeLe));

    const [{ nonLus }] = await tx
      .select({ nonLus: count() })
      .from(rapportHierarchique)
      .where(and(eq(rapportHierarchique.entrepriseId, utilisateurConnecte.entrepriseId), eq(rapportHierarchique.destinataireId, utilisateurConnecte.utilisateurId), isNull(rapportHierarchique.luLe)));

    const peutEcrire = peut(utilisateurConnecte, "RH", "CREER") && (await destinatairesPossibles(tx, utilisateurConnecte)).length > 0;
    return { rapports, nonLus, peutEcrire };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">{t("Votre abonnement est suspendu : renouvelez-le pour accéder à cette fonctionnalité.")}</p>
      </div>
    );
  }

  const { rapports, nonLus, peutEcrire } = donnees;
  const format = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/rh" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Ressources Humaines")}
      </Link>

      {/* Bandeau d'accueil aux couleurs de la marque */}
      <div className="relative flex animate-in flex-col gap-5 overflow-hidden rounded-3xl bg-linear-to-br from-primary to-marque-bleu-800 p-6 text-primary-foreground shadow-lg shadow-primary/20 duration-500 fade-in slide-in-from-bottom-2 sm:p-8">
        <span aria-hidden className="animate-flotter-lentement pointer-events-none absolute -top-10 -right-8 size-44 rounded-full bg-marque-orange/25 blur-2xl" />
        <span aria-hidden className="animate-flotter-lentement-inverse pointer-events-none absolute -bottom-12 left-1/3 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <FileText className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{t("Rapports écrits")}</h1>
              <p className="text-sm text-primary-foreground/80">{t("Écrivez à votre responsable, lisez les rapports de votre équipe.")}</p>
            </div>
          </div>
          {peutEcrire ? (
            <Button
              size="lg"
              className="bg-marque-orange font-semibold text-marque-bleu-950 shadow-md transition-transform hover:-translate-y-0.5 hover:bg-marque-orange-400"
              render={<Link href="/app/rh/rapports-ecrits/nouveau" />}
              nativeButton={false}
            >
              <Plus data-icon="inline-start" aria-hidden />
              {t("Nouveau rapport")}
            </Button>
          ) : null}
        </div>
        {peutEcrire ? (
          <div className="relative flex flex-wrap gap-2">
            {MODELES_RAPPORT.map((m) => (
              <Link
                key={m.id}
                href={`/app/rh/rapports-ecrits/nouveau?modele=${m.id}`}
                className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/22"
              >
                {t(m.libelle)}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* Onglets */}
      <div className="flex gap-2 text-sm" role="tablist">
        <Link
          href="/app/rh/rapports-ecrits"
          role="tab"
          aria-selected={!vueEnvoyes}
          className={cn("flex items-center gap-2 rounded-full px-4 py-2 font-medium transition-all duration-200", !vueEnvoyes ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground")}
        >
          <Inbox className="size-4" aria-hidden />
          {t("Reçus")}
          {nonLus > 0 ? <span className="flex min-w-5 items-center justify-center rounded-full bg-marque-orange px-1.5 text-[11px] font-semibold text-marque-bleu-950 tabular-nums">{nonLus}</span> : null}
        </Link>
        <Link
          href="/app/rh/rapports-ecrits?vue=envoyes"
          role="tab"
          aria-selected={vueEnvoyes}
          className={cn("flex items-center gap-2 rounded-full px-4 py-2 font-medium transition-all duration-200", vueEnvoyes ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground")}
        >
          <Send className="size-4" aria-hidden />
          {t("Envoyés")}
        </Link>
      </div>

      {/* Liste */}
      <div className="flex flex-col gap-3">
        {rapports.map((r, index) => {
          const modele = trouverModele(r.modele) ?? trouverModele("LIBRE")!;
          const nouveau = !vueEnvoyes && !r.luLe;
          const autre = vueEnvoyes ? r.destinataireNom : r.auteurNom;
          return (
            <Link
              key={r.id}
              href={`/app/rh/rapports-ecrits/${r.id}`}
              style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              className={cn(
                "group relative flex animate-in items-center gap-3.5 overflow-hidden rounded-2xl border bg-card p-4 shadow-xs transition-all duration-200 fade-in slide-in-from-bottom-3 fill-mode-both hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                nouveau ? "border-marque-orange/50" : "border-border",
              )}
            >
              {nouveau ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-marque-orange" /> : null}
              <PastilleModele modele={modele} className="transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate", nouveau ? "font-semibold" : "font-medium")}>{r.objet}</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <AvatarCollaborateur nom={autre} adresse={null} taille="petit" />
                  <span className="truncate">
                    {vueEnvoyes ? t("À") : t("De")} {autre}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{format.format(r.creeLe)}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t(modele.libelle)}</span>
                {vueEnvoyes ? (
                  <span className={cn("flex items-center gap-1 font-medium", r.luLe ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    <span aria-hidden className={cn("size-1.5 rounded-full", r.luLe ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                    {r.luLe ? t("Lu") : t("Non lu")}
                  </span>
                ) : nouveau ? (
                  <span className="flex items-center gap-1 font-semibold text-marque-orange-700 dark:text-marque-orange-300">
                    <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-marque-orange" />
                    {t("Nouveau")}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}

        {rapports.length === 0 ? (
          <div className="flex animate-in flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center duration-500 fade-in zoom-in-95">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{vueEnvoyes ? <Send className="size-6" aria-hidden /> : <Inbox className="size-6" aria-hidden />}</span>
            <p className="font-medium">{vueEnvoyes ? t("Aucun rapport envoyé pour le moment.") : t("Aucun rapport reçu pour le moment.")}</p>
            {peutEcrire && vueEnvoyes ? (
              <Button render={<Link href="/app/rh/rapports-ecrits/nouveau" />} nativeButton={false}>
                <Plus data-icon="inline-start" aria-hidden />
                {t("Écrire mon premier rapport")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
