import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { produit } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

// Miroir de src/app/app/documents/[id]/route.ts — jamais d'URL R2 publique
// stockée, une URL signée fraîche à chaque requête. La portée entreprise
// est garantie par avecEntreprise() (RLS) : impossible de résoudre l'image
// d'un produit d'une autre entreprise, même en devinant son id.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "PRODUITS", "VOIR")) return new NextResponse("Introuvable", { status: 404 });

  const [leProduit] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select({ imageCleStockage: produit.imageCleStockage }).from(produit).where(eq(produit.id, id))
  );
  if (!leProduit?.imageCleStockage) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(leProduit.imageCleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
