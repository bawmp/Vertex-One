import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { resoudreMonContact } from "@/lib/portail/acces";
import { trouverDevisDuContact } from "@/lib/portail/documents";
import { obtenirOuCreerLien } from "@/lib/client-documents/liens";

export const dynamic = "force-dynamic";

/** Ouvre la page privée d'un devis depuis le portail : seul le Contact destinataire y accède, et jamais un brouillon. */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return NextResponse.redirect(new URL("/connexion", requete.url));
  if (utilisateurConnecte.role !== "CLIENT") return NextResponse.redirect(new URL("/app", requete.url));

  const jeton = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const monContact = await resoudreMonContact(tx, utilisateurConnecte);
    if (!monContact) return null;
    const devisId = await trouverDevisDuContact(tx, monContact.id, id);
    return devisId ? obtenirOuCreerLien(tx, utilisateurConnecte.entrepriseId, { devisId }) : null;
  });
  if (!jeton) return new NextResponse("Introuvable", { status: 404 });
  return NextResponse.redirect(new URL(`/devis/${jeton}`, requete.url));
}
