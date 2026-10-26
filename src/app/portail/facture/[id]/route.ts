import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreMonContact } from "@/lib/portail/acces";
import { trouverFactureDuContact } from "@/lib/portail/documents";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";

export const dynamic = "force-dynamic";

/**
 * Ouvre la page privée d'une facture depuis le portail : seul le Contact propriétaire de la facture y accède (jamais un identifiant pris tel
 * quel), puis on le redirige vers le lien habituel `/facture/<jeton>` — la même page que celle de l'email, où il paie.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return NextResponse.redirect(new URL("/connexion", requete.url));
  if (utilisateurConnecte.role !== "CLIENT") return NextResponse.redirect(new URL("/app", requete.url));

  const jeton = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return null;
    const factureId = await trouverFactureDuContact(tx, monContact.id, id);
    return factureId ? obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { factureId }) : null;
  });
  if (!jeton) return new NextResponse("Introuvable", { status: 404 });
  return NextResponse.redirect(new URL(`/facture/${jeton}`, requete.url));
}
