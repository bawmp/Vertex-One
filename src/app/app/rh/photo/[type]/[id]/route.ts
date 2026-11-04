import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { utilisateur } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { lireObjetStockage } from "@/lib/documents/stockage";
import { trouverStagiaireAcademique } from "@/lib/rh/stage";

/**
 * Photo d'un collaborateur ou d'un stagiaire. Jamais servie par son seul lien : session et droit de voir la fiche revérifiés à chaque
 * appel (la personne elle-même, l'Administrateur, ou un Manager dont la portée RH couvre la personne ; pour un stagiaire académique,
 * qui peut voir sa fiche). Les octets ont été vérifiés au téléversement (image reconnue, jamais de SVG ni de HTML).
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const u = await recupererUtilisateurConnecte();
  if (!u) return new NextResponse("Non authentifié", { status: 401 });
  if (type !== "utilisateur" && type !== "stagiaire") return new NextResponse("Introuvable", { status: 404 });

  const photo = await avecEntreprise(u.entrepriseId, async (tx) => {
    if (type === "stagiaire") {
      const s = await trouverStagiaireAcademique(tx, u, id);
      return s?.photoCleStockage && s.photoTypeMime ? { cle: s.photoCleStockage, mime: s.photoTypeMime } : null;
    }
    // `utilisateur` reste en RLS permissive (Better-Auth) : le filtre sur l'entreprise est explicite.
    const [p] = await tx.select({ cle: utilisateur.photoCleStockage, mime: utilisateur.photoTypeMime }).from(utilisateur).where(and(eq(utilisateur.id, id), eq(utilisateur.entrepriseId, u.entrepriseId)));
    if (!p?.cle || !p.mime) return null;
    if (u.utilisateurId !== id) {
      if (!peut(u, "RH", "VOIR")) return null;
      const ids = await idsVisibles(tx, u, "RH");
      if (ids !== "TOUT" && !ids.includes(id)) return null;
    }
    return { cle: p.cle, mime: p.mime };
  });
  if (!photo) return new NextResponse("Introuvable", { status: 404 });

  const octets = await lireObjetStockage(photo.cle).catch(() => null);
  if (!octets) return new NextResponse("Photo indisponible", { status: 503 });
  return new NextResponse(new Uint8Array(octets), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
