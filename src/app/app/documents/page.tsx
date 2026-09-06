import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { FileText, Lock, Download, ShieldAlert } from "lucide-react";
import { avecEntreprise } from "@/db/client";
import { document, dossier, projet, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { dossiersVisibles, projetsVisibles } from "@/lib/portee";
import { peutVoirDocumentSensible, estCategorieSensible } from "@/lib/documents/acces";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LIBELLE_CATEGORIE: Record<string, string> = {
  GENERAL: "Général",
  PIECE_IDENTITE: "Pièce d'identité",
  DONNEES_SANTE: "Données de santé",
  AUTRE_SENSIBLE: "Autre sensible",
};

export default async function PageDocuments() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));

    if (!disponible(monEntreprise, "CHAT_INTERNE")) return null;

    // Palier 3, section 7 — même portée que les Dossiers/Projets auxquels
    // chaque document est rattaché, pas de permission séparée à inventer.
    const [idsDossiers, idsProjets] = await Promise.all([dossiersVisibles(tx, utilisateurConnecte), projetsVisibles(tx, utilisateurConnecte)]);

    const tousLesDocuments = await tx.select().from(document).where(eq(document.entrepriseId, utilisateurConnecte.entrepriseId));
    const visibles = tousLesDocuments.filter((d) => {
      if (d.dossierId) return idsDossiers === "TOUT" || idsDossiers.includes(d.dossierId);
      if (d.projetId) return idsProjets === "TOUT" || idsProjets.includes(d.projetId);
      return false;
    });

    const idsDossiersDesDocs = [...new Set(visibles.map((d) => d.dossierId).filter((id): id is string => !!id))];
    const dossiersConcernes = idsDossiersDesDocs.length > 0 ? await tx.select().from(dossier).where(inArray(dossier.id, idsDossiersDesDocs)) : [];
    const dossiersParId = Object.fromEntries(dossiersConcernes.map((d) => [d.id, d]));

    const idsProjetsDesDocs = [...new Set(visibles.map((d) => d.projetId).filter((id): id is string => !!id))];
    const projetsConcernes = idsProjetsDesDocs.length > 0 ? await tx.select().from(projet).where(inArray(projet.id, idsProjetsDesDocs)) : [];
    const projetsParId = Object.fromEntries(projetsConcernes.map((p) => [p.id, p]));

    // Section 9 — un document PIECE_IDENTITE/DONNEES_SANTE reste restreint
    // au responsable du Dossier et à l'Administrateur, même si l'utilisateur
    // voit par ailleurs le Dossier/Projet dans son ensemble.
    const documentsAutorises = visibles.filter((d) => {
      if (!estCategorieSensible(d.categorie)) return true;
      const responsableId = d.dossierId ? dossiersParId[d.dossierId]?.responsableId : null;
      return peutVoirDocumentSensible(utilisateurConnecte, d.categorie, responsableId ?? null);
    });

    return { documents: documentsAutorises, dossiersParId, projetsParId };
  });

  if (!donnees) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Les Documents sont disponibles à partir du forfait Pro.</p>
      </div>
    );
  }

  const { documents, dossiersParId, projetsParId } = donnees;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <FileText className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Pour ajouter un document, ouvrez le dossier ou le projet concerné — un document est toujours rattaché à l&apos;un des deux.
      </p>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {documents.map((d) => {
            const rattachement = d.dossierId ? dossiersParId[d.dossierId]?.titre : d.projetId ? projetsParId[d.projetId]?.titre : null;
            const lienRattachement = d.dossierId ? `/app/projets/dossiers/${d.dossierId}` : d.projetId ? `/app/projets/${d.projetId}` : null;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {estCategorieSensible(d.categorie) ? <ShieldAlert className="size-3.5 shrink-0 text-amber-600" aria-hidden /> : null}
                    {d.nom}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lienRattachement ? (
                      <Link href={lienRattachement} className="hover:text-foreground hover:underline">
                        {rattachement}
                      </Link>
                    ) : (
                      rattachement
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={estCategorieSensible(d.categorie) ? "warning" : "neutral"}>{LIBELLE_CATEGORIE[d.categorie]}</Badge>
                  <a
                    href={`/app/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Télécharger ${d.nom}`}
                  >
                    <Download className="size-4" aria-hidden />
                  </a>
                </div>
              </div>
            );
          })}
          {documents.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aucun document pour le moment.</p> : null}
        </div>
      </Card>
    </div>
  );
}
