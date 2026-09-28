import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { recupererFactureAcomptePourPDF } from "@/lib/pdf/donnees";
import { rendreDocumentCommercialPDF } from "@/lib/pdf/rendu";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) =>
    recupererFactureAcomptePourPDF(tx, utilisateurConnecte, id)
  );

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await rendreDocumentCommercialPDF({
    typeDocument: "FACTURE_ACOMPTE",
    numero: donnees.factureAcompte.numero,
    dateEmission: donnees.factureAcompte.dateEmission,
    entreprise: donnees.entreprise,
    client: donnees.client,
    montantTTC: donnees.factureAcompte.montant,
    montantRestant: donnees.factureAcompte.montantRestant,
    moyenPaiement: donnees.moyenPaiementLibelle ?? undefined,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.factureAcompte.numero}.pdf"`,
    },
  });
}
