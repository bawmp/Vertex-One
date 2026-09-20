import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { rechercherMessages } from "@/lib/messagerie/acces";

/**
 * Recherche dans les messages (texte et noms de pièces jointes) : uniquement dans les canaux que la personne a le
 * droit de voir — jamais un groupe privé ou un message direct dont elle n'est pas membre. Session et droits
 * revérifiés à chaque appel.
 *   ?q=texte
 */
export async function GET(request: Request) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const resultats = await avecEntreprise(utilisateurConnecte.entrepriseId, (tx) => rechercherMessages(tx, utilisateurConnecte, q));
  return NextResponse.json({ resultats }, { headers: { "Cache-Control": "no-store" } });
}
