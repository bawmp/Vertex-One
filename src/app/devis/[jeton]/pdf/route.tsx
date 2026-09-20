import { NextResponse } from "next/server";
import { chargerDevisParJeton } from "@/lib/client-documents/chargement";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

// PDF du devis pour le client — sans compte, le jeton du lien est l'autorisation.
export async function GET(_request: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const donnees = await chargerDevisParJeton(jeton);
  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "DEVIS",
    numero: donnees.devis.numero,
    dateEmission: donnees.devis.creeLe,
    dateEcheanceOuValidite: donnees.devis.dateValidite,
    labelDateSecondaire: "Valide jusqu'au",
    entreprise: donnees.entreprise,
    client: donnees.client,
    lignes: donnees.lignes,
    montantHT: donnees.devis.montantHT,
    montantTVA: donnees.devis.montantTVA,
    montantTTC: donnees.devis.montantTTC,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${donnees.devis.numero}.pdf"` },
  });
}
