import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { enregistrerActivite, listerCollegues, messagerieDisponible } from "@/lib/messagerie/acces";

/** Collègues et leur présence (en ligne = actif il y a moins de 2 minutes), rafraîchis par la page de messagerie. */
export async function GET() {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const collegues = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    if (!(await messagerieDisponible(tx, utilisateurConnecte))) return null;
    await enregistrerActivite(tx, utilisateurConnecte);
    return listerCollegues(tx, utilisateurConnecte);
  });
  if (!collegues) return new NextResponse("Introuvable", { status: 404 });
  return NextResponse.json({ collegues }, { headers: { "Cache-Control": "no-store" } });
}
