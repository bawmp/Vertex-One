import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db/client";
import { entreprise } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { disponible } from "@/lib/plans";
import { chargerFiche, isoDuJour, jourDepuisIso } from "@/lib/rh/presences";
import { chargerSemaine } from "@/lib/rh/presences-semaine";
import { FichePresenceSemainePDF } from "@/lib/pdf/fiche-presence-semaine";
import { logoPourPDF } from "@/lib/pdf/logo";
import { FichePresencePDF } from "@/lib/pdf/fiche-presence";

export const dynamic = "force-dynamic";

/** PDF de la fiche de présence d'un jour (`?date=aaaa-mm-jj`, aujourd'hui par défaut) : réservé à l'Administrateur et au gérant de la fiche. */
export async function GET(requete: Request) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  const [e] = await db.select().from(entreprise).where(eq(entreprise.id, utilisateurConnecte.entrepriseId));
  if (!e || !disponible(e, "RH")) return new NextResponse("Introuvable", { status: 404 });

  const parametres = new URL(requete.url).searchParams;
  // Fiche de la semaine (lundi → dimanche) : `?semaine=aaaa-mm-jj` (n'importe quel jour de la semaine), mode par défaut du bouton d'impression.
  const semaine = parametres.get("semaine");
  if (semaine) {
    if (!jourDepuisIso(semaine)) return new NextResponse("Date invalide", { status: 400 });
    const ficheSemaine = await chargerSemaine(utilisateurConnecte, semaine);
    if (!ficheSemaine) return new NextResponse("Introuvable", { status: 404 });
    const logo = await logoPourPDF(e.logoCleStockage, e.logoTypeMime);
    const donnees = { fiche: ficheSemaine, entreprise: { nom: e.nom, logoUrl: logo, couleurMarque: e.couleurMarque } };
    let pdf: Buffer;
    try {
      pdf = await renderToBuffer(<FichePresenceSemainePDF {...donnees} />);
    } catch (erreur) {
      console.error("[pdf] fiche de présence (semaine) : rendu en échec, nouvel essai sans logo :", erreur instanceof Error ? erreur.message : erreur);
      if (!logo) throw erreur;
      pdf = await renderToBuffer(<FichePresenceSemainePDF {...donnees} entreprise={{ ...donnees.entreprise, logoUrl: null }} />);
    }
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fiche-presence-semaine-${ficheSemaine.jours[0]}.pdf"`, "Cache-Control": "private, no-store" } });
  }

  const date = parametres.get("date") ?? isoDuJour(new Date());
  const fiche = await chargerFiche(utilisateurConnecte, date);
  if (!fiche) return new NextResponse("Introuvable", { status: 404 });

  const logoUrl = await logoPourPDF(e.logoCleStockage, e.logoTypeMime);
  const props = { fiche, entreprise: { nom: e.nom, logoUrl, couleurMarque: e.couleurMarque } };
  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(<FichePresencePDF {...props} />);
  } catch (erreur) {
    // Un logo que react-pdf ne sait pas lire ne doit jamais empêcher la fiche de sortir : on réessaie sans lui.
    console.error("[pdf] fiche de présence : rendu en échec, nouvel essai sans logo :", erreur instanceof Error ? erreur.message : erreur);
    if (!logoUrl) throw erreur;
    buffer = await renderToBuffer(<FichePresencePDF {...props} entreprise={{ ...props.entreprise, logoUrl: null }} />);
  }

  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fiche-presence-${fiche.date}.pdf"`, "Cache-Control": "private, no-store" } });
}
