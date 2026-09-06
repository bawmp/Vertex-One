import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { documentFinancier } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "COMPTABILITE", "VOIR")) return new NextResponse("Introuvable", { status: 404 });

  const [leDocument] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select({ cleStockage: documentFinancier.cleStockage }).from(documentFinancier).where(eq(documentFinancier.id, id))
  );
  if (!leDocument) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(leDocument.cleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
