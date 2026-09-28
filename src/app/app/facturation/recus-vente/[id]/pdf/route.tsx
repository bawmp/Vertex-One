import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { recupererRecuVentePourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    recupererRecuVentePourPDF(tx, utilisateurConnecte, id)
  );

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "RECU_VENTE",
    numero: donnees.recuVente.numero,
    dateEmission: donnees.recuVente.dateEmission,
    entreprise: donnees.entreprise,
    client: donnees.client,
    lignes: donnees.lignes,
    montantHT: donnees.recuVente.montantHT,
    montantTVA: donnees.recuVente.montantTVA,
    montantTTC: donnees.recuVente.montantTTC,
    moyenPaiement: donnees.moyenPaiementLibelle,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.recuVente.numero}.pdf"`,
    },
  });
}
