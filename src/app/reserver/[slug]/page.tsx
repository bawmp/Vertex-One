import { resoudreParametresPublics, obtenirServicesEtIntervenants } from "@/lib/actions/reservations-publiques";
import { AssistantReservation } from "./assistant-reservation";

/**
 * Route publique, accessible sans session — même famille que /p/[slug]
 * (page d'atterrissage) et /signature/[jeton] : entrepriseId toujours
 * re-résolu côté serveur depuis le slug (voir
 * src/lib/actions/reservations-publiques.ts), jamais reçu du client.
 */
export default async function PageReservationPublique({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const parametres = await resoudreParametresPublics(slug);
  if (!parametres) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  const donnees = await obtenirServicesEtIntervenants(slug);
  if (!donnees) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-4 py-16 text-emerald-50">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{parametres.titre}</h1>
        {parametres.texte ? <p className="whitespace-pre-line text-emerald-100/90">{parametres.texte}</p> : null}
      </div>

      <div className="w-full max-w-xl rounded-lg bg-background p-6 text-foreground shadow-lg">
        <AssistantReservation slug={slug} services={donnees.services} intervenants={donnees.intervenants} delaiMaximumJours={parametres.delaiMaximumJours} />
      </div>
    </div>
  );
}
