import { NextResponse } from "next/server";
import { lirePayToken } from "@/lib/aangaraa/utilitaires";
import { traiterNotificationPaiement } from "@/lib/paiement/confirmation";

/**
 * Webhook public Aangaraa Pay — une seule adresse pour toute l'application, transmise à chaque création de lien (`notify_url`),
 * qui sert à la fois les factures des entreprises clientes et l'abonnement à Vertex One : la référence de la transaction, relue
 * chez Aangaraa Pay, dit laquelle (voir src/lib/paiement/confirmation.ts). Le prestataire ne signe pas ses notifications : rien de
 * leur contenu n'est cru, seul le `payToken` (au format validé) sert à relire la transaction. Il attend un HTTP 200 : tout autre
 * code est traité comme « à rappeler ». La charge est du JSON (POST) ; le formulaire et la requête GET sont acceptés aussi.
 */
async function lire(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const depuisUrl = lirePayToken(Object.fromEntries(url.searchParams));
  if (depuisUrl || request.method !== "POST") return depuisUrl;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) return lirePayToken((await request.json()) as Record<string, unknown>);
    return lirePayToken(Object.fromEntries(await request.formData()));
  } catch {
    return null; // corps illisible : traité comme un paytoken manquant
  }
}

async function traiter(request: Request) {
  const issue = await traiterNotificationPaiement({ payToken: await lire(request) });
  return new NextResponse(issue.message, { status: issue.code });
}

export const GET = traiter;
export const POST = traiter;
