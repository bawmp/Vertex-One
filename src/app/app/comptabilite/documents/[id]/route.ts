import { NextResponse } from "next/server";
import { getT } from "@/lib/i18n/langue";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { documentFinancier } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) redirect("/connexion");
  if (!peut(utilisateurConnecte, "COMPTABILITE", "VOIR")) return new NextResponse(t("Introuvable"), { status: 404 });

  const [leDocument] = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    tx.select({ cleStockage: documentFinancier.cleStockage }).from(documentFinancier).where(eq(documentFinancier.id, id))
  );
  if (!leDocument) return new NextResponse(t("Introuvable"), { status: 404 });

  const url = await urlTelechargementDocument(leDocument.cleStockage);
  if (!url) return new NextResponse(t("Stockage R2 non configuré pour le moment."), { status: 503 });

  return NextResponse.redirect(url);
}
