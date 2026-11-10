import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { disponible } from "@/lib/plans";
import { lireRapportPourPersonne } from "@/lib/rh/rapport-hierarchique";
import { rubriquesDuRapport, trouverModele, MODELE_PAR_DEFAUT } from "@/lib/rh/rapport-modeles";
import { RapportHierarchiquePDF } from "@/lib/pdf/rapport-hierarchique";
import { logoPourPDF } from "@/lib/pdf/logo";

export const dynamic = "force-dynamic";

/**
 * PDF d'un rapport écrit sur le papier à en-tête de l'entreprise. Réservé à l'auteur et au destinataire (l'Administrateur compris n'y a
 * pas accès s'il n'est ni l'un ni l'autre) : même contrôle que la page, jamais un identifiant d'entreprise pris dans la requête.
 * Télécharger le PDF ne marque pas le rapport comme lu.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });
  if (!peut(utilisateurConnecte, "RH", "VOIR")) return new NextResponse("Introuvable", { status: 404 });
  const { id } = await params;

  const rapport = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => lireRapportPourPersonne(tx, utilisateurConnecte, id, { marquerLu: false }));
  if (!rapport || !rapport.entreprise || !disponible(rapport.entreprise, "RH")) return new NextResponse("Introuvable", { status: 404 });

  const e = rapport.entreprise;
  const logoUrl = await logoPourPDF(e.logoCleStockage, e.logoTypeMime);
  const props = {
    entreprise: { nom: e.nom, logoUrl, couleurMarque: e.couleurMarque, adresse: e.adresse, ville: e.ville, niu: e.niu, rccm: e.rccm, filigraneDocuments: e.filigraneDocuments },
    rapport: {
      objet: rapport.objet,
      modeleLibelle: (trouverModele(rapport.modele) ?? trouverModele(MODELE_PAR_DEFAUT)!).libelle,
      auteurNom: rapport.auteurNom,
      destinataireNom: rapport.destinataireNom,
      creeLe: rapport.creeLe,
      rubriques: rubriquesDuRapport(rapport.modele, rapport.sections),
      contenu: rapport.contenu,
    },
  };

  let pdf: Buffer;
  try {
    pdf = await renderToBuffer(<RapportHierarchiquePDF {...props} />);
  } catch (erreur) {
    // Un logo que react-pdf ne sait pas lire ne doit jamais empêcher le rapport de sortir : on réessaie sans lui.
    console.error("[pdf] rapport écrit : rendu en échec, nouvel essai sans logo :", erreur instanceof Error ? erreur.message : erreur);
    if (!logoUrl) throw erreur;
    pdf = await renderToBuffer(<RapportHierarchiquePDF {...props} entreprise={{ ...props.entreprise, logoUrl: null }} />);
  }

  const nomFichier = `rapport-${rapport.objet.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "rapport"}.pdf`;
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomFichier}"`, "Cache-Control": "private, no-store" } });
}
