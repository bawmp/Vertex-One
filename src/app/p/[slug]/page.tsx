import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { pageAtterrissage } from "@/db/schema";
import { FormulaireContactPublic } from "./formulaire-contact";

/**
 * Route publique — docs/palier-6-*, section 3. Lecture via `db` direct
 * (pas avecEntreprise()), comme /invitation/[jeton] et /signature/[jeton] :
 * c'est la policy RLS de pageAtterrissage (permissive quand publiee = true
 * et qu'aucune session n'est active) qui autorise cette lecture anonyme.
 */
export default async function PageAtterrissagePublique({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db
    .select()
    .from(pageAtterrissage)
    .where(and(eq(pageAtterrissage.slug, slug), eq(pageAtterrissage.publiee, true)));

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-4 py-16 text-emerald-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        {page.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- contenu externe saisi par l'utilisateur, pas un asset du projet
          <img src={page.imageUrl} alt="" className="max-h-64 w-full rounded-lg object-cover" />
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{page.titre}</h1>
        <p className="whitespace-pre-line text-emerald-100/90">{page.texte}</p>
      </div>

      <div className="w-full max-w-sm rounded-lg bg-background p-6 text-foreground shadow-lg">
        <FormulaireContactPublic slug={slug} texteBouton={page.texteBouton} />
      </div>
    </div>
  );
}
