import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { formulaire, champFormulaire } from "@/db/schema";
import { verifierDisponibiliteFormulaire } from "@/lib/actions/one-form";
import { FormulaireRemplissagePublic } from "./formulaire-remplissage-public";

/**
 * Route publique — même patron que /p/[slug] (src/app/p/[slug]/page.tsx) :
 * lecture via `db` direct, autorisée par la policy RLS "lecture_publique_ou_
 * entreprise" de `formulaire`/`champFormulaire` (voir src/db/schema.ts).
 */
export default async function PageFormulairePublic({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [leFormulaire] = await db
    .select()
    .from(formulaire)
    .where(and(eq(formulaire.slug, slug), eq(formulaire.publie, true)));

  if (!leFormulaire) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Ce formulaire n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const raisonIndisponible = await verifierDisponibiliteFormulaire(leFormulaire);

  const champs = raisonIndisponible ? [] : await db.select().from(champFormulaire).where(eq(champFormulaire.formulaireId, leFormulaire.id)).orderBy(asc(champFormulaire.ordre));

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-marque-bleu-800 via-marque-bleu to-marque-bleu-900 p-4 py-16 text-marque-bleu-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{leFormulaire.titre}</h1>
        {leFormulaire.description ? <p className="whitespace-pre-line text-marque-bleu-100/90">{leFormulaire.description}</p> : null}
      </div>

      <div className="w-full max-w-xl rounded-lg bg-background p-6 text-foreground shadow-lg">
        {raisonIndisponible ? (
          <p className="text-sm text-muted-foreground">{raisonIndisponible}</p>
        ) : (
          <FormulaireRemplissagePublic
            slug={slug}
            champs={champs.map((c) => ({ id: c.id, type: c.type, libelle: c.libelle, obligatoire: c.obligatoire, options: c.options ?? null }))}
            messageConfirmation={leFormulaire.messageConfirmation}
          />
        )}
      </div>
    </div>
  );
}
