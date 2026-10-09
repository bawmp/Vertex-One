import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { journalExportDonnees } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { ecrireCsv } from "@/lib/export/csv";
import { exporterDonnees, NOM_FICHIER_EXPORT, TYPES_EXPORT } from "@/lib/export/exporteurs";

/**
 * GET /app/parametres/export/[type] — télécharge un type de données de l'espace en CSV (relisible par l'assistant
 * d'import). Réservé à l'Administrateur : c'est la copie intégrale de données clients. Chaque téléchargement est consigné
 * au journal des exports (qui, quoi, combien de lignes — jamais le contenu). `[type]` est le nom de fichier (« contacts »,
 * « factures »…), validé contre la liste fermée des types exportables.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type: nom } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (utilisateurConnecte.role !== "ADMIN" || !peut(utilisateurConnecte, "PARAMETRES", "VOIR")) return new NextResponse("Réservé à l'administrateur", { status: 403 });

  const type = TYPES_EXPORT.find((t) => NOM_FICHIER_EXPORT[t] === nom);
  if (!type) return new NextResponse("Type d'export inconnu", { status: 404 });

  const jeu = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const donnees = await exporterDonnees(tx, utilisateurConnecte.entrepriseId, type);
    await tx.insert(journalExportDonnees).values({
      entrepriseId: utilisateurConnecte.entrepriseId,
      utilisateurId: utilisateurConnecte.utilisateurId,
      type,
      nombreLignes: donnees.lignes.length,
    });
    return donnees;
  });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(ecrireCsv(jeu.entetes, jeu.lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vertexone-${NOM_FICHIER_EXPORT[type]}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
