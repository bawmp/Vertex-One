import { redirect } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ArrowLeft, ArrowRight, CheckCheck, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { rapportHierarchique, utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { peutLireRapport } from "@/lib/rh/rapport-hierarchique-regles";
import { trouverModele } from "@/lib/rh/rapport-modeles";
import { AvatarCollaborateur } from "@/components/avatar-collaborateur";
import { PastilleModele } from "../icones-modeles";
import { getT } from "@/lib/i18n/langue";

export default async function PageRapportEcrit({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  const { id } = await params;

  const auteur = alias(utilisateur, "auteur");
  const destinataire = alias(utilisateur, "destinataire");

  const rapport = peut(utilisateurConnecte, "RH", "VOIR")
    ? await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
        const [r] = await tx
          .select({
            objet: rapportHierarchique.objet,
            contenu: rapportHierarchique.contenu,
            modele: rapportHierarchique.modele,
            sections: rapportHierarchique.sections,
            creeLe: rapportHierarchique.creeLe,
            luLe: rapportHierarchique.luLe,
            auteurId: rapportHierarchique.auteurId,
            destinataireId: rapportHierarchique.destinataireId,
            auteurNom: auteur.nomComplet,
            destinataireNom: destinataire.nomComplet,
          })
          .from(rapportHierarchique)
          .innerJoin(auteur, eq(rapportHierarchique.auteurId, auteur.id))
          .innerJoin(destinataire, eq(rapportHierarchique.destinataireId, destinataire.id))
          .where(and(eq(rapportHierarchique.id, id), eq(rapportHierarchique.entrepriseId, utilisateurConnecte.entrepriseId)));
        // Ni l'auteur ni le destinataire : même réponse que pour un rapport qui n'existe pas (on ne révèle rien), l'Administrateur compris.
        if (!r || !peutLireRapport(utilisateurConnecte.utilisateurId, r)) return null;

        // Le destinataire qui ouvre le rapport le marque comme lu (horloge de la base).
        if (r.destinataireId === utilisateurConnecte.utilisateurId && !r.luLe) {
          await tx
            .update(rapportHierarchique)
            .set({ luLe: sql`now()` })
            .where(and(eq(rapportHierarchique.id, id), isNull(rapportHierarchique.luLe)));
        }
        return r;
      })
    : null;

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

  const modele = trouverModele(rapport.modele) ?? trouverModele("LIBRE")!;
  // Un rapport d'avant les modèles (ou libre) n'a pas de rubriques : on montre son texte tel quel.
  const rubriques = (rapport.sections ?? []).flatMap((s) => {
    const r = modele.rubriques.find((x) => x.cle === s.cle);
    return r ? [{ cle: s.cle, libelle: modele.id === "LIBRE" ? null : t(r.libelle), texte: s.texte, ligne: r.type === "ligne" }] : [];
  });
  const lu = Boolean(rapport.luLe) || rapport.destinataireId === utilisateurConnecte.utilisateurId;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/app/rh/rapports-ecrits" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("Rapports écrits")}
      </Link>

      <header className="relative flex animate-in flex-col gap-5 overflow-hidden rounded-3xl bg-linear-to-br from-primary to-marque-bleu-800 p-6 text-primary-foreground shadow-lg shadow-primary/20 duration-500 fade-in slide-in-from-bottom-2 sm:p-8">
        <span aria-hidden className="animate-flotter-lentement pointer-events-none absolute -top-10 -right-8 size-44 rounded-full bg-marque-orange/25 blur-2xl" />
        <div className="relative flex items-start gap-3.5">
          <PastilleModele modele={modele} taille="grand" className="ring-1 ring-white/30" />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-primary-foreground/75 uppercase">{t(modele.libelle)}</p>
            <h1 className="text-2xl leading-tight font-semibold tracking-tight">{rapport.objet}</h1>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2.5 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <AvatarCollaborateur nom={rapport.auteurNom} adresse={null} taille="petit" />
            <span className="truncate font-medium">{rapport.auteurNom}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary-foreground/60" aria-hidden />
          <span className="flex min-w-0 items-center gap-2">
            <AvatarCollaborateur nom={rapport.destinataireNom} adresse={null} taille="petit" />
            <span className="truncate font-medium">{rapport.destinataireNom}</span>
          </span>
          <span className="text-primary-foreground/75">{new Intl.DateTimeFormat(t.locale, { dateStyle: "long", timeStyle: "short" }).format(rapport.creeLe)}</span>
          {lu ? (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
              <CheckCheck className="size-3.5" aria-hidden />
              {t("Lu")}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3.5">
        {rubriques.length > 0 ? (
          rubriques.map((s, index) => (
            <section
              key={s.cle}
              style={{ animationDelay: `${120 + index * 70}ms` }}
              className="animate-in rounded-2xl border border-border bg-card p-5 shadow-xs duration-500 fade-in slide-in-from-bottom-3 fill-mode-both"
            >
              {s.libelle ? <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{s.libelle}</h2> : null}
              <p className={s.ligne ? "text-base font-medium" : "text-sm leading-relaxed whitespace-pre-wrap"}>{s.texte}</p>
            </section>
          ))
        ) : (
          <section className="animate-in rounded-2xl border border-border bg-card p-5 shadow-xs duration-500 fade-in slide-in-from-bottom-3 fill-mode-both">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{rapport.contenu}</p>
          </section>
        )}
      </div>
    </div>
  );
}
