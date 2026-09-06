import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, ne, asc, inArray } from "drizzle-orm";
import { ArrowLeft, ListChecks } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { tache, projet, dossier, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { LigneTache } from "../[id]/ligne-tache";

export default async function PageMesTaches() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "PROJETS")) return null;

    const mesTaches = await tx
      .select()
      .from(tache)
      .where(and(eq(tache.assigneAId, utilisateurConnecte.utilisateurId), ne(tache.statut, "TERMINEE")))
      .orderBy(asc(tache.echeance));

    const idsProjets = [...new Set(mesTaches.map((t) => t.projetId))];
    const projets = idsProjets.length > 0 ? await tx.select().from(projet).where(inArray(projet.id, idsProjets)) : [];
    const idsDossiers = [...new Set(projets.map((p) => p.dossierId))];
    const dossiers = idsDossiers.length > 0 ? await tx.select().from(dossier).where(inArray(dossier.id, idsDossiers)) : [];

    const projetsParId = Object.fromEntries(projets.map((p) => [p.id, p]));
    const dossiersParId = Object.fromEntries(dossiers.map((d) => [d.id, d]));

    return { mesTaches, projetsParId, dossiersParId };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">Les Projets sont disponibles à partir du forfait Pro.</p>
      </div>
    );
  }

  const { mesTaches, projetsParId, dossiersParId } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/app/projets" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour
      </Link>

      <div className="flex items-center gap-2.5">
        <ListChecks className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Mes tâches</h1>
      </div>

      {mesTaches.length > 0 ? (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {mesTaches.map((t) => {
              const leProjet = projetsParId[t.projetId];
              const leDossier = leProjet ? dossiersParId[leProjet.dossierId] : undefined;
              return (
                <div key={t.id} className="flex flex-col gap-1 px-4 py-2.5">
                  {leProjet ? (
                    <Link href={`/app/projets/${leProjet.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                      {leDossier?.titre} → {leProjet.titre}
                    </Link>
                  ) : null}
                  <LigneTache
                    id={t.id}
                    titre={t.titre}
                    statut={t.statut}
                    assigneNom="Vous"
                    echeance={t.echeance}
                    peutModifier
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Aucune tâche en cours qui vous soit assignée.</p>
      )}
    </div>
  );
}
