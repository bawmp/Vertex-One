import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { ListChecks, Lock } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { dossier, entreprise, prospect } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { dossiersVisibles } from "@/lib/portee";
import { libelleDossier } from "@/lib/vocabulaire";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUT_DOSSIER } from "@/lib/libelles";

export default async function PageProjets() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const { monEntreprise, dossiers, prospectsParId } = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [e] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement, secteurProfil: entreprise.secteurProfil })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(e, "DOSSIERS") || !peut(utilisateurConnecte.role, "DOSSIERS", "VOIR")) {
      return { monEntreprise: e, dossiers: null, prospectsParId: {} };
    }

    const visibles = await dossiersVisibles(tx, utilisateurConnecte);
    const lignes =
      visibles === "TOUT"
        ? await tx.select().from(dossier).where(eq(dossier.entrepriseId, utilisateurConnecte.entrepriseId))
        : visibles.length === 0
          ? []
          : await tx.select().from(dossier).where(inArray(dossier.id, visibles));

    const idsProspects = lignes.map((d) => d.prospectId);
    const prospects = idsProspects.length > 0 ? await tx.select().from(prospect).where(inArray(prospect.id, idsProspects)) : [];

    return { monEntreprise: e, dossiers: lignes, prospectsParId: Object.fromEntries(prospects.map((p) => [p.id, p])) };
  });

  const vocab = libelleDossier(monEntreprise?.secteurProfil ?? "generique");

  if (dossiers === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          {vocab.pluriel} et Projets sont disponibles à partir du forfait Pro.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vocab.pluriel}</h1>
          <p className="text-muted-foreground">
            {dossiers.length} {vocab.singulier.toLowerCase()}
            {dossiers.length > 1 ? "s" : ""}.
          </p>
        </div>
        <Link
          href="/app/projets/mes-taches"
          className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ListChecks className="size-4" aria-hidden />
          Mes tâches
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dossiers.map((d, index) => {
          const info = STATUT_DOSSIER[d.statut];
          return (
            <Link
              key={d.id}
              href={`/app/projets/dossiers/${d.id}`}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_6px_rgba(0,0,0,0.05),0_16px_32px_-16px_rgba(0,0,0,0.14)] hover:ring-primary/30">
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{d.titre}</p>
                    <Badge variant={info?.variante ?? "neutral"}>{info?.libelle ?? d.statut}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{prospectsParId[d.prospectId]?.telephone}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {dossiers.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">
            Aucun {vocab.singulier.toLowerCase()} pour le moment — un devis accepté en ouvre un automatiquement.
          </p>
        ) : null}
      </div>
    </div>
  );
}
