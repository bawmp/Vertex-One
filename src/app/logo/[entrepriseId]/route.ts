import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

/**
 * Route publique, sans session — un logo n'est pas une donnée sensible et
 * doit s'afficher aussi bien dans /app, /portail, que les pages publiques
 * (/reserver, /carrieres). Lecture via `db` direct : la table entreprise
 * n'a pas de RLS (voir schema.ts), déjà le patron utilisé partout ailleurs
 * pour cette table (ex. src/app/app/layout.tsx).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ entrepriseId: string }> }) {
  const { entrepriseId } = await params;

  const [ligne] = await db.select({ logoCleStockage: entreprise.logoCleStockage }).from(entreprise).where(eq(entreprise.id, entrepriseId));
  if (!ligne?.logoCleStockage) return new NextResponse("Introuvable", { status: 404 });

  const url = await urlTelechargementDocument(ligne.logoCleStockage);
  if (!url) return new NextResponse("Stockage R2 non configuré pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
