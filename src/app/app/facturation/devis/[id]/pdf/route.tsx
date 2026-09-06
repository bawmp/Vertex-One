import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { recupererDevisPourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    recupererDevisPourPDF(tx, utilisateurConnecte, id)
  );

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "DEVIS",
    numero: donnees.devis.numero,
    dateEmission: donnees.devis.creeLe,
    dateEcheanceOuValidite: donnees.devis.dateValidite,
    labelDateSecondaire: "Valide jusqu'au",
    entreprise: donnees.entreprise,
    client: donnees.prospect,
    lignes: donnees.lignes,
    montantHT: donnees.devis.montantHT,
    montantTVA: donnees.devis.montantTVA,
    montantTTC: donnees.devis.montantTTC,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.devis.numero}.pdf"`,
    },
  });
}
