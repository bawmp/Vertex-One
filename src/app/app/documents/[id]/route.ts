import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { journaliserAccesDocument } from "@/lib/actions/document";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");

  const resultat = await journaliserAccesDocument(id, "telechargement");
  if (!resultat.autorise) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(resultat.cleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
