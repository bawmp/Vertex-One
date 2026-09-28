import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { recupererBonCommandeVentePourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    recupererBonCommandeVentePourPDF(tx, utilisateurConnecte, id)
  );

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "BON_COMMANDE",
    numero: donnees.bonCommandeVente.numero,
    dateEmission: donnees.bonCommandeVente.dateCommande,
    entreprise: donnees.entreprise,
    client: donnees.client,
    lignes: donnees.lignes,
    montantHT: donnees.bonCommandeVente.montantHT,
    montantTVA: donnees.bonCommandeVente.montantTVA,
    montantTTC: donnees.bonCommandeVente.montantTTC,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.bonCommandeVente.numero}.pdf"`,
    },
  });
}
