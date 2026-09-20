import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { avecEntreprise } from "@/db/client";
import { valeurChampReponse, champFormulaire } from "@/db/schema";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { peut } from "@/lib/permissions";
import { urlTelechargementDocument } from "@/lib/documents/stockage";
import { decoderValeurFichier } from "@/lib/one-form/fichiers";

/**
 * Téléchargement d'un fichier reçu via un champ « Fichier » de One Form.
 * Jamais d'accès public au bucket : session obligatoire, droit VOIR sur
 * One Form, lecture de la valeur via avecEntreprise() (la RLS empêche donc de
 * lire le fichier d'une autre entreprise même en devinant un identifiant), puis
 * redirection vers une URL signée de 10 minutes forçant le téléchargement.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ valeurId: string }> }) {
  const { valeurId } = await params;

  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non connecté", { status: 401 });
  if (!peut(utilisateurConnecte, "ONE_FORM", "VOIR")) return new NextResponse("Accès refusé", { status: 403 });

  const ligne = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const [resultat] = await tx
      .select({ valeur: valeurChampReponse.valeur, type: champFormulaire.type })
      .from(valeurChampReponse)
      .innerJoin(champFormulaire, eq(champFormulaire.id, valeurChampReponse.champFormulaireId))
      .where(eq(valeurChampReponse.id, valeurId));
    return resultat ?? null;
  });

  if (!ligne || ligne.type !== "FICHIER") return new NextResponse("Fichier introuvable", { status: 404 });
  const fichier = decoderValeurFichier(ligne.valeur);
  if (!fichier) return new NextResponse("Fichier introuvable", { status: 404 });

  const url = await urlTelechargementDocument(fichier.cle, fichier.nom);
  if (!url) return new NextResponse("Stockage indisponible", { status: 503 });

  return NextResponse.redirect(url);
}
