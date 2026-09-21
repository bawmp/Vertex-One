import { NextResponse } from "next/server";
import { traiterNotificationCampay } from "@/lib/paiement/confirmation";

/**
 * Webhook public CamPay — une seule adresse pour toute l'application (réglée dans le tableau de bord CamPay), qui sert à la
 * fois les factures des entreprises clientes et l'abonnement à Vertex One : la référence externe de la transaction dit
 * lequel (voir src/lib/paiement/confirmation.ts). CamPay notifie par une requête GET dont les paramètres portent la référence
 * et une signature ; le POST est accepté aussi (JSON ou formulaire). Rien de ce contenu n'est cru : la transaction est relue
 * chez CamPay.
 */
async function lire(request: Request): Promise<{ reference: string | null; signature: string | null }> {
  const url = new URL(request.url);
  let reference = url.searchParams.get("reference");
  let signature = url.searchParams.get("signature");
  if (request.method === "POST" && !reference) {
    try {
      const type = request.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const corps = (await request.json()) as { reference?: string; signature?: string };
        reference = corps.reference ?? null;
        signature = corps.signature ?? signature;
      } else {
        const formulaire = await request.formData();
        reference = (formulaire.get("reference") as string | null) ?? null;
        signature = (formulaire.get("signature") as string | null) ?? signature;
      }
    } catch {
      // corps illisible : traité comme une référence manquante
    }
  }
  return { reference, signature };
}

async function traiter(request: Request) {
  const issue = await traiterNotificationCampay(await lire(request));
  return new NextResponse(issue.message, { status: issue.code });
}

export const GET = traiter;
export const POST = traiter;
