import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { dossierRH, documentRH } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peutVoirSalaire } from "@/lib/rh/acces";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

// Miroir de src/app/app/produits/[id]/image/route.ts — jamais d'URL R2
// publique stockée, une URL signée fraîche à chaque requête. Même garde
// que pour l'upload/la suppression (Admin ou l'intéressé).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [leDossier] = await tx.select({ utilisateurId: dossierRH.utilisateurId }).from(dossierRH).where(eq(dossierRH.id, id));
    if (!leDossier || !peutVoirSalaire(utilisateurConnecte, leDossier.utilisateurId)) return null;

    const [leDocument] = await tx.select({ cleStockage: documentRH.cleStockage }).from(documentRH).where(eq(documentRH.id, documentId));
    return leDocument ?? null;
  });

  if (!resultat) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(resultat.cleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
