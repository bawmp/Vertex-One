import Link from "next/link";
import { ArrowDown, ArrowRight, Briefcase, MapPin, Sparkles } from "lucide-react";
import { obtenirPostesOuverts, resoudreParametresRecrutementPublics } from "@/lib/actions/recrutement-publique";
import { FondAnime } from "../_composants/fond-anime";
import { EnteteEntreprise } from "../_composants/entete-entreprise";
import { PiedPage } from "../_composants/pied-page";
import { PageIntrouvable } from "../_composants/page-introuvable";
import { iconeAtout, teinte } from "../_composants/palette";

/**
 * Route publique, accessible sans session — même famille que /reserver/[slug]
 * et /p/[slug] : entrepriseId toujours re-résolu côté serveur depuis le
 * slug (voir src/lib/actions/recrutement-publique.ts).
 */
export default async function PageCarrieresPubliques({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const parametres = await resoudreParametresRecrutementPublics(slug);
  if (!parametres) return <PageIntrouvable message="Cette page n'existe pas ou n'est plus disponible." />;

  const postes = await obtenirPostesOuverts(slug);
  const styleMarque = parametres.couleurMarque ? ({ "--primary": parametres.couleurMarque } as React.CSSProperties) : undefined;
  const nombreLieux = new Set(postes.map((p) => p.lieu).filter(Boolean)).size;
  const delai = (ms: number) => ({ "--delai": `${ms}ms` }) as React.CSSProperties;

  return (
    <div className="relative isolate overflow-hidden" style={styleMarque}>
      <FondAnime />

      <main className="mx-auto flex max-w-5xl flex-col gap-20 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="carrieres-monter">
          <EnteteEntreprise entrepriseId={parametres.entrepriseId} nomEntreprise={parametres.nomEntreprise} logoCleStockage={parametres.logoCleStockage} />
        </div>

        <section className="flex flex-col items-center gap-6 text-center">
          <span className="carrieres-monter inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary" style={delai(100)}>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {postes.length > 0 ? "Nous recrutons" : "Rejoignez l'aventure"}
          </span>

          <h1
            className="carrieres-monter carrieres-degrade max-w-3xl bg-gradient-to-r from-primary via-marque-orange to-marque-orange-400 bg-clip-text pb-1 text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl"
            style={delai(200)}
          >
            {parametres.titre}
          </h1>

          {parametres.texte ? (
            <p className="carrieres-monter max-w-2xl whitespace-pre-line text-lg leading-relaxed text-stone-600" style={delai(320)}>
              {parametres.texte}
            </p>
          ) : null}

          <div className="carrieres-monter flex flex-wrap items-center justify-center gap-3" style={delai(440)}>
            {postes.length > 0 ? (
              <a
                href="#postes"
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40"
              >
                Découvrir les offres
                <ArrowDown className="size-4 transition-transform group-hover:translate-y-1" aria-hidden />
              </a>
            ) : null}
          </div>

          {postes.length > 0 ? (
            <ul className="carrieres-monter flex flex-wrap items-center justify-center gap-2 text-sm" style={delai(560)}>
              <li className="rounded-full bg-marque-orange-100 px-3.5 py-1.5 font-medium text-marque-orange-800">
                {postes.length} offre{postes.length > 1 ? "s" : ""} ouverte{postes.length > 1 ? "s" : ""}
              </li>
              {nombreLieux > 0 ? (
                <li className="rounded-full bg-sky-100 px-3.5 py-1.5 font-medium text-sky-800">
                  {nombreLieux} lieu{nombreLieux > 1 ? "x" : ""}
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        {parametres.avantages.length > 0 ? (
          <section className="flex flex-col gap-8">
            <div className="carrieres-reveler flex flex-col items-center gap-2 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Pourquoi nous rejoindre</h2>
              <p className="text-stone-500">Ce que {parametres.nomEntreprise} vous offre au quotidien.</p>
            </div>
            <ul className="flex flex-wrap justify-center gap-4">
              {parametres.avantages.map((atout, i) => {
                const t = teinte(i);
                const Icone = iconeAtout(i);
                return (
                  <li
                    key={i}
                    className={`carrieres-reveler group flex w-full items-start gap-4 rounded-2xl sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] border border-white p-5 shadow-sm ring-1 ring-stone-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${t.fond}`}
                    style={delai(i * 90)}
                  >
                    <span className={`carrieres-tortiller flex size-11 shrink-0 items-center justify-center rounded-xl ${t.pastille}`}>
                      <Icone className="size-5" aria-hidden />
                    </span>
                    <p className="pt-2 font-medium leading-snug text-stone-800">{atout}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section id="postes" className="flex scroll-mt-8 flex-col gap-8">
          <div className="carrieres-reveler flex flex-col items-center gap-2 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Nos offres</h2>
            <p className="text-stone-500">Trouvez le poste qui vous ressemble.</p>
          </div>

          {postes.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {postes.map((poste, i) => {
                const t = teinte(i);
                return (
                  <li key={poste.id} className="carrieres-reveler" style={delai(i * 80)}>
                    <Link
                      href={`/carrieres/${slug}/${poste.id}`}
                      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 pl-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-xl sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${t.barre} transition-all duration-300 group-hover:w-2.5`} />
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <h3 className="text-xl font-semibold tracking-tight text-stone-900">{poste.titre}</h3>
                        {poste.lieu || poste.typeContrat ? (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {poste.lieu ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700">
                                <MapPin className="size-3.5" aria-hidden />
                                {poste.lieu}
                              </span>
                            ) : null}
                            {poste.typeContrat ? (
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${t.puce}`}>
                                <Briefcase className="size-3.5" aria-hidden />
                                {poste.typeContrat}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {poste.description ? <p className="line-clamp-2 text-sm leading-relaxed text-stone-500">{poste.description}</p> : null}
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground sm:self-center">
                        Postuler
                        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="carrieres-reveler mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl bg-white/70 p-10 text-center shadow-sm ring-1 ring-stone-100">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <Sparkles className="size-7" aria-hidden />
              </span>
              <p className="text-lg font-semibold text-stone-800">Aucun poste ouvert pour le moment</p>
              <p className="text-stone-500">Revenez bientôt pour découvrir nos prochaines offres.</p>
            </div>
          )}
        </section>

        <PiedPage />
      </main>
    </div>
  );
}
