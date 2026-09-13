import Link from "next/link";
import { obtenirPostesOuverts, resoudreParametresRecrutementPublics } from "@/lib/actions/recrutement-publique";

/**
 * Route publique, accessible sans session — même famille que /reserver/[slug]
 * et /p/[slug] : entrepriseId toujours re-résolu côté serveur depuis le
 * slug (voir src/lib/actions/recrutement-publique.ts).
 */
export default async function PageCarrieresPubliques({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const parametres = await resoudreParametresRecrutementPublics(slug);
  if (!parametres) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const postes = await obtenirPostesOuverts(slug);

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-4 py-16 text-emerald-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{parametres.titre}</h1>
        {parametres.texte ? <p className="whitespace-pre-line text-emerald-100/90">{parametres.texte}</p> : null}
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        {postes.map((p) => (
          <Link
            key={p.id}
            href={`/carrieres/${slug}/${p.id}`}
            className="flex flex-col gap-1 rounded-lg bg-background p-4 text-foreground shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <p className="font-medium">{p.titre}</p>
            {p.lieu ? <p className="text-sm text-muted-foreground">{p.lieu}</p> : null}
          </Link>
        ))}
        {postes.length === 0 ? <p className="text-center text-emerald-100/80">Aucun poste ouvert pour le moment.</p> : null}
      </div>
    </div>
  );
}
