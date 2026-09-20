import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, avecEntreprise } from "@/db/client";
import { signataire, demandeSignature, document } from "@/db/schema";
import { urlTelechargementDocument } from "@/lib/documents/stockage";

/**
 * Le signataire relit le document AVANT de signer. Route publique : le jeton du lien
 * de signature est l'unique autorisation. Le signataire est retrouvé par le jeton
 * (lecture anonyme autorisée par la RLS de `signataire`), puis le document est lu
 * avec l'entrepriseId de cette ligne — jamais un identifiant venu du navigateur.
 * Le fichier est servi par une URL signée temporaire, jamais un accès public au bucket.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const [leSignataire] = await db.select().from(signataire).where(eq(signataire.jetonAcces, jeton));
  if (!leSignataire) return new NextResponse("Lien invalide", { status: 404 });

  const ligne = await avecEntreprise(leSignataire.entrepriseId, async (tx) => {
    const [r] = await tx
      .select({ nom: document.nom, cleStockage: document.cleStockage })
      .from(demandeSignature)
      .innerJoin(document, eq(demandeSignature.documentId, document.id))
      .where(eq(demandeSignature.id, leSignataire.demandeSignatureId));
    return r ?? null;
  });
  if (!ligne) return new NextResponse("Document introuvable", { status: 404 });

  const url = await urlTelechargementDocument(ligne.cleStockage, ligne.nom);
  if (!url) return new NextResponse("Le stockage des documents n'est pas disponible pour le moment.", { status: 503 });

  return NextResponse.redirect(url);
}
