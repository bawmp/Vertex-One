import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { messageCanal } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { canalAccessible } from "@/lib/messagerie/acces";
import { lireObjetStockage, urlTelechargementDocument } from "@/lib/documents/stockage";

/**
 * Pièce jointe d'un message. Session et droit d'accès au canal revérifiés à chaque appel : le fichier n'est
 * jamais accessible par son seul lien.
 *   - image (`?apercu=1`) : servie en ligne, ses octets ayant été vérifiés (jamais de SVG ni de HTML) ;
 *   - tout le reste : URL signée temporaire, en téléchargement forcé.
 */
export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const piece = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [m] = await tx
      .select({ canalId: messageCanal.canalId, cle: messageCanal.pieceJointeCle, nom: messageCanal.pieceJointeNom, type: messageCanal.pieceJointeType, supprimeLe: messageCanal.supprimeLe })
      .from(messageCanal)
      .where(and(eq(messageCanal.id, messageId), eq(messageCanal.entrepriseId, utilisateurConnecte.entrepriseId)));
    if (!m || m.supprimeLe || !m.cle || !m.nom || !m.type) return null;
    if (!(await canalAccessible(tx, utilisateurConnecte, m.canalId))) return null;
    return { cle: m.cle, nom: m.nom, type: m.type };
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
