import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { recupererFacturePourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    recupererFacturePourPDF(tx, utilisateurConnecte, id)
  );

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
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.facture.numero}.pdf"`,
    },
  });
}
