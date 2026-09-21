import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { entreprise, pieceJointeAnnonce } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { lireObjetStockage, urlTelechargementDocument } from "@/lib/documents/stockage";

/**
 * Pièce jointe d'une annonce. Session, droit de voir les annonces et forfait revérifiés à chaque appel : le fichier n'est
 * jamais accessible par son seul lien.
 *   - image (`?apercu=1`) : servie en ligne, ses octets ayant été vérifiés à l'envoi (jamais de SVG ni de HTML) ;
 *   - tout le reste : URL signée temporaire, en téléchargement forcé.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (!peut(utilisateurConnecte, "ANNONCES", "VOIR")) return new NextResponse("Introuvable", { status: 404 });

  const piece = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [monEntreprise] = await tx
      .select({ planAbonnement: entreprise.planAbonnement, statutAbonnement: entreprise.statutAbonnement })
      .from(entreprise)
      .where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
    if (!monEntreprise || !disponible(monEntreprise, "CHAT_INTERNE")) return null;
    const [p] = await tx
      .select({ cle: pieceJointeAnnonce.cleStockage, nom: pieceJointeAnnonce.nom, type: pieceJointeAnnonce.typeMime })
      .from(pieceJointeAnnonce)
      .where(and(eq(pieceJointeAnnonce.id, id), eq(pieceJointeAnnonce.entrepriseId, utilisateurConnecte.entrepriseId)));
    return p ?? null;
  });
  if (!piece) return new NextResponse("Introuvable", { status: 404 });

  const apercu = new URL(request.url).searchParams.get("apercu") === "1";
  if (apercu && piece.type.startsWith("image/")) {
    const octets = await lireObjetStockage(piece.cle).catch(() => null);
    if (!octets) return new NextResponse("Fichier indisponible", { status: 503 });
    return new NextResponse(new Uint8Array(octets), {
      headers: { "Content-Type": piece.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
    });
  }

  const url = await urlTelechargementDocument(piece.cle, piece.nom);
  if (!url) return new NextResponse("Le stockage des fichiers n'est pas disponible pour le moment.", { status: 503 });
  return NextResponse.redirect(url);
}
