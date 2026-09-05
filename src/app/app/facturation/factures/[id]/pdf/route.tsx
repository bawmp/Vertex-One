import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { avecEntreprise } from "@/db/client";
import { facture, ligneFacture, prospect, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { idsVisibles } from "@/lib/portee";
import { DocumentCommercialPDF } from "@/lib/pdf/document-commercial";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [f] = await tx.select().from(facture).where(eq(facture.id, id));
    if (!f) return null;

    const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
    const [p] = await tx.select().from(prospect).where(eq(prospect.id, f.prospectId));
    if (visibles !== "TOUT" && p && !visibles.includes(p.assigneAId)) return null;

    const [lignes, [monEntreprise]] = await Promise.all([
      tx.select().from(ligneFacture).where(eq(ligneFacture.factureId, id)),
      tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
    ]);

    return { facture: f, lignes, prospect: p, entreprise: monEntreprise };
  });

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await renderToBuffer(
    <DocumentCommercialPDF
      typeDocument="FACTURE"
      numero={donnees.facture.numero}
      dateEmission={donnees.facture.dateEmission}
      dateEcheanceOuValidite={donnees.facture.dateEcheance}
      labelDateSecondaire="Date d'échéance"
      entreprise={donnees.entreprise}
      client={donnees.prospect}
      lignes={donnees.lignes}
      montantHT={donnees.facture.montantHT}
      montantTVA={donnees.facture.montantTVA}
      montantTTC={donnees.facture.montantTTC}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.facture.numero}.pdf"`,
    },
  });
}
