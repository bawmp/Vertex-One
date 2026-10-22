import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { documentRedigeAutorise, genererFichier, type FormatExport } from "@/lib/redaction/service";

/**
 * Téléchargement (ou aperçu) d'un document rédigé en PDF ou Word : GET ?format=pdf|docx[&apercu=1].
 * Session, droit sur le module DOCUMENTS et portée revérifiés à chaque appel ; l'identifiant n'est jamais cru seul.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const url = new URL(requete.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const apercu = url.searchParams.get("apercu") === "1" && format === "pdf";

  const fichier = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const d = await documentRedigeAutorise(tx, utilisateurConnecte, id, "VOIR");
    return d ? genererFichier(tx, utilisateurConnecte.entrepriseId, d, format as FormatExport) : null;
  });
  if (!fichier) return new NextResponse("Introuvable", { status: 404 });

  return new NextResponse(new Uint8Array(fichier.contenu), {
    headers: {
      "Content-Type": fichier.typeMime,
      // Nom encodé (RFC 5987) : accents et espaces sans risque d'injection d'en-tête.
      "Content-Disposition": `${apercu ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fichier.nom)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
