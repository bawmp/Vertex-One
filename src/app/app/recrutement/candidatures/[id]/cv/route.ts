import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { candidature } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { idsVisibles } from "@/lib/portee";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte.role, "RECRUTEMENT", "VOIR")) return new NextResponse("Introuvable", { status: 404 });

  const cleStockage = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const ids = await idsVisibles(tx, utilisateurConnecte, "RECRUTEMENT");
    const [laCandidature] = await tx.select({ cvCleStockage: candidature.cvCleStockage, assigneAId: candidature.assigneAId }).from(candidature).where(eq(candidature.id, id));
    if (!laCandidature) return null;
    if (ids !== "TOUT" && !(laCandidature.assigneAId && ids.includes(laCandidature.assigneAId))) return null;
    return laCandidature.cvCleStockage;
  });
  if (!cleStockage) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(cleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
