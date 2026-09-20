import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { enregistrerActivite, totalNonLus } from "@/lib/messagerie/acces";

/**
 * Nombre total de messages non lus (badge du menu) — appelé régulièrement depuis toute l'application. Sert aussi de
 * signe de vie : c'est ce qui rend un collègue « en ligne » tant que son navigateur est ouvert sur Vertex One.
 */
export async function GET() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const total = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    await enregistrerActivite(tx, utilisateurConnecte);
    return totalNonLus(tx, utilisateurConnecte);
  });
  return NextResponse.json({ total }, { headers: { "Cache-Control": "no-store" } });
}
