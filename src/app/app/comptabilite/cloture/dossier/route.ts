import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, journalExportDonnees } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { construireDossierExpert } from "@/lib/comptabilite/dossier-expert";

/**
 * GET /app/comptabilite/cloture/dossier?annee=2026 — télécharge le dossier de l'expert-comptable (ZIP de CSV) d'un exercice. Même garde
 * que la comptabilité : session, droit COMPTABILITE/VOIR (Administrateur seul) et forfait comptabilité complète, revérifiés ici.
 * Chaque téléchargement est consigné au journal des exports (qui, quoi, combien de fichiers — jamais le contenu).
 */
export async function GET(requete: Request) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) return new NextResponse("Réservé à l'administrateur", { status: 403 });

  const annee = Number(new URL(requete.url).searchParams.get("annee"));
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) return new NextResponse("Exercice invalide", { status: 400 });

  const archive = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx.select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement }).from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!disponible(monEntreprise, "COMPTABILITE_COMPLETE")) return "forfait" as const;
    const zip = await construireDossierExpert(tx, utilisateurConnecte.entrepriseId, annee);
    if (zip) await tx.insert(journalExportDonnees).values({ entrepriseId: utilisateurConnecte.entrepriseId, utilisateurId: utilisateurConnecte.utilisateurId, type: "DOSSIER_EXPERT_COMPTABLE", nombreLignes: 9 });
    return zip;
  });
  if (archive === "forfait") return new NextResponse("La comptabilité complète est disponible à partir du forfait Business.", { status: 403 });
  if (!archive) return new NextResponse("Exercice invalide", { status: 400 });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="vertexone-dossier-expert-comptable-${annee}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
