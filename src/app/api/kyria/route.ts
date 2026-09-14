import { NextResponse } from "next/server";
import { z } from "zod";
import { demanderReponseKyria } from "@/lib/kyria/client";

/**
 * Route publique (site vitrine, aucune session) — pas de lien avec
 * avecEntreprise()/entrepriseId, Kyria ne manipule aucune donnée de
 * tenant ici. Historique limité pour éviter un corps de requête abusif ;
 * pas de limitation de débit pour cette V1 (voir le plan/roadmap — à
 * ajouter avant une mise en production à fort trafic).
 */
const schemaRequete = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }

  const analyse = schemaRequete.safeParse(corps);
  if (!analyse.success) {
    return NextResponse.json({ erreur: "Message invalide." }, { status: 400 });
  }

  const resultat = await demanderReponseKyria(analyse.data.messages);

  if (resultat.erreur) {
    return NextResponse.json({ erreur: resultat.erreur }, { status: 503 });
  }

  return NextResponse.json({ reponse: resultat.reponse });
}
