import { NextResponse } from "next/server";
import { chargerFactureParJeton } from "@/lib/client-documents/chargement";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

// PDF de la facture pour le client — sans compte, le jeton du lien est l'autorisation.
export async function GET(_request: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const donnees = await chargerFactureParJeton(jeton);
  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "FACTURE",
    numero: donnees.facture.numero,
    dateEmission: donnees.facture.dateEmission,
    dateEcheanceOuValidite: donnees.facture.dateEcheance,
    labelDateSecondaire: "Date d'échéance",
    entreprise: donnees.entreprise,
    client: donnees.client,
    lignes: donnees.lignes,
    montantHT: donnees.facture.montantHT,
    montantTVA: donnees.facture.montantTVA,
    montantTTC: donnees.facture.montantTTC,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${donnees.facture.numero}.pdf"` },
  });
}
