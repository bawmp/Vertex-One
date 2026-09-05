import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { avecEntreprise } from "@/db/client";
import { devis, ligneDevis, prospect, entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { idsVisibles } from "@/lib/portee";
import { DocumentCommercialPDF } from "@/lib/pdf/document-commercial";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const donnees = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [d] = await tx.select().from(devis).where(eq(devis.id, id));
    if (!d) return null;

    const visibles = await idsVisibles(tx, utilisateurConnecte, "FACTURATION");
    const [p] = await tx.select().from(prospect).where(eq(prospect.id, d.prospectId));
    if (visibles !== "TOUT" && p && !visibles.includes(p.assigneAId)) return null;

    const [lignes, [monEntreprise]] = await Promise.all([
      tx.select().from(ligneDevis).where(eq(ligneDevis.devisId, id)),
      tx.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId)),
    ]);

    return { devis: d, lignes, prospect: p, entreprise: monEntreprise };
  });

  if (!donnees) return new NextResponse("Introuvable", { status: 404 });

  const buffer = await renderToBuffer(
    <DocumentCommercialPDF
      typeDocument="DEVIS"
      numero={donnees.devis.numero}
      dateEmission={donnees.devis.creeLe}
      dateEcheanceOuValidite={donnees.devis.dateValidite}
      labelDateSecondaire="Valide jusqu'au"
      entreprise={donnees.entreprise}
      client={donnees.prospect}
      lignes={donnees.lignes}
      montantHT={donnees.devis.montantHT}
      montantTVA={donnees.devis.montantTVA}
      montantTTC={donnees.devis.montantTTC}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${donnees.devis.numero}.pdf"`,
    },
  });
}
