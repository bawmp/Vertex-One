import { NextResponse } from "next/server";
import { avecEntreprise } from "@/db/client";
import { recupererUtilisateurConnecte } from "@/lib/session";
import { canalAccessible, chargerMessages, enregistrerActivite, marquerCanalLu } from "@/lib/messagerie/acces";

/**
 * Lecture d'une conversation, appelée régulièrement par le navigateur pour afficher les nouveaux messages
 * sans recharger la page.
 *   ?canal=ID                 les derniers messages
 *   ?canal=ID&avant=ISO       une page plus ancienne (historique)
 *   ?canal=ID&apres=ISO       tout ce qui a changé depuis (nouveaux messages, suppressions, réactions, réponses)
 *   ?canal=ID&fil=MESSAGE_ID  le fil d'un message (ce message et ses réponses)
 *   &lu=1                     la personne regarde le canal : son compteur de non-lus repart à zéro
 * Session et droit d'accès au canal revérifiés à chaque appel.
 */
export async function GET(request: Request) {
  const utilisateurConnecte = await recupererUtilisateurConnecte();
  if (!utilisateurConnecte) return new NextResponse("Non authentifié", { status: 401 });

  const url = new URL(request.url);
  const canalId = url.searchParams.get("canal") ?? "";
  const date = (nom: string) => {
    const brut = url.searchParams.get(nom);
    const d = brut ? new Date(brut) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  const apres = date("apres");
  const avant = date("avant");
  const lu = url.searchParams.get("lu") === "1";
  const fil = url.searchParams.get("fil") || undefined;

  const resultat = await avecEntreprise(utilisateurConnecte.entrepriseId, async (tx) => {
    const leCanal = await canalAccessible(tx, utilisateurConnecte, canalId);
    if (!leCanal) return null;
    await enregistrerActivite(tx, utilisateurConnecte);
    const messages = await chargerMessages(tx, canalId, utilisateurConnecte.utilisateurId, { apres, avant, fil, limite: fil ? 200 : 50 });
    if (lu) await marquerCanalLu(tx, utilisateurConnecte.entrepriseId, canalId, utilisateurConnecte.utilisateurId);
    return { messages, plusAnciens: avant ? messages.length === 50 : undefined };
  });

  if (!resultat) return new NextResponse("Introuvable", { status: 404 });
  return NextResponse.json(resultat, { headers: { "Cache-Control": "no-store" } });
}
