import Link from "next/link";
import { ArrowLeft, Briefcase, MapPin } from "lucide-react";
import { obtenirPosteOuvert, resoudreParametresRecrutementPublics } from "@/lib/actions/recrutement-publique";
import { FondAnime } from "../../_composants/fond-anime";
import { EnteteEntreprise } from "../../_composants/entete-entreprise";
import { PiedPage } from "../../_composants/pied-page";
import { PageIntrouvable } from "../../_composants/page-introuvable";
import { iconeAtout, teinte } from "../../_composants/palette";
import { FormulaireCandidature } from "./formulaire-candidature";

export default async function PagePosteOuvertPublic({ params }: { params: Promise<{ slug: string; posteId: string }> }) {
  const { slug, posteId } = await params;

  const parametres = await resoudreParametresRecrutementPublics(slug);
  if (!parametres) return <PageIntrouvable message="Cette page n'existe pas ou n'est plus disponible." />;

  const poste = await obtenirPosteOuvert(slug, posteId);
  if (!poste) {
    return <PageIntrouvable message="Ce poste n'est plus disponible, mais d'autres vous attendent." lien={{ href: `/carrieres/${slug}`, libelle: "Voir toutes les offres" }} />;
  }

  const styleMarque = parametres.couleurMarque ? ({ "--primary": parametres.couleurMarque } as React.CSSProperties) : undefined;
  const delai = (ms: number) => ({ "--delai": `${ms}ms` }) as React.CSSProperties;

  return (
    <div className="relative isolate overflow-hidden" style={styleMarque}>
      <FondAnime />

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="carrieres-monter flex flex-wrap items-center justify-between gap-4">
          <EnteteEntreprise entrepriseId={parametres.entrepriseId} nomEntreprise={parametres.nomEntreprise} logoCleStockage={parametres.logoCleStockage} />
          <Link
            href={`/carrieres/${slug}`}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm ring-1 ring-stone-200 transition hover:text-primary hover:ring-primary/40"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
            Toutes les offres
          </Link>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[1fr_26rem]">
          <div className="flex flex-col gap-8">
            <header className="carrieres-monter flex flex-col gap-4" style={delai(100)}>
              {poste.lieu || poste.typeContrat ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {poste.typeContrat ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 font-semibold text-primary">
                      <Briefcase className="size-3.5" aria-hidden />
                      {poste.typeContrat}
                    </span>
                  ) : null}
                  {poste.lieu ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3.5 py-1.5 font-semibold text-sky-800">
                      <MapPin className="size-3.5" aria-hidden />
                      {poste.lieu}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 sm:text-5xl">{poste.titre}</h1>
            </header>

            {poste.description ? (
              <section className="carrieres-monter rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-100 sm:p-8" style={delai(220)}>
                <h2 className="mb-3 text-lg font-semibold text-stone-900">À propos du poste</h2>
                <p className="whitespace-pre-line leading-relaxed text-stone-600">{poste.description}</p>
              </section>
            ) : null}

            {parametres.avantages.length > 0 ? (
              <section className="carrieres-monter flex flex-col gap-4" style={delai(340)}>
                <h2 className="text-lg font-semibold text-stone-900">Ce que nous vous offrons</h2>
                <ul className="flex flex-wrap gap-2.5">
                  {parametres.avantages.map((atout, i) => {
                    const t = teinte(i);
                    const Icone = iconeAtout(i);
                    return (
                      <li key={i} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${t.puce}`}>
                        <Icone className="size-4" aria-hidden />
                        {atout}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="carrieres-monter lg:sticky lg:top-8" style={delai(280)}>
            <FormulaireCandidature slug={slug} posteId={posteId} titrePoste={poste.titre} nomEntreprise={parametres.nomEntreprise} />
          </div>
        </div>

        <PiedPage />
      </main>
    </div>
  );
}
