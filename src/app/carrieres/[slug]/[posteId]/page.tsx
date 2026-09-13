import { obtenirPosteOuvert, resoudreParametresRecrutementPublics } from "@/lib/actions/recrutement-publique";
import { FormulaireCandidature } from "./formulaire-candidature";

export default async function PagePosteOuvertPublic({ params }: { params: Promise<{ slug: string; posteId: string }> }) {
  const { slug, posteId } = await params;

  const parametres = await resoudreParametresRecrutementPublics(slug);
  if (!parametres) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const poste = await obtenirPosteOuvert(slug, posteId);
  if (!poste) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Ce poste n&apos;est plus disponible.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-4 py-16 text-emerald-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{poste.titre}</h1>
        {poste.lieu ? <p className="text-emerald-100/90">{poste.lieu}</p> : null}
        {poste.description ? <p className="whitespace-pre-line text-emerald-100/90">{poste.description}</p> : null}
      </div>

      <div className="w-full max-w-xl rounded-lg bg-background p-6 text-foreground shadow-lg">
        <FormulaireCandidature slug={slug} posteId={posteId} />
      </div>
    </div>
  );
}
