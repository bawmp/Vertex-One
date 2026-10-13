import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { signatureWebhookValide } from "@/lib/facebook/jetons";
import { traiterProspectFacebook } from "@/lib/facebook/traitement";
import { evenementsLeadgen, type ChargeWebhookFacebook } from "@/lib/facebook/evenements";
import { envoyerEmail } from "@/lib/email/client";
import { gabaritNouveauLeadExterne } from "@/lib/email/gabarits";
import { SOURCE_FACEBOOK } from "@/lib/facebook/prospect";

/**
 * Webhook de Meta pour les prospects des publicités à formulaire (Lead Ads), 2026-10-13.
 *
 * - GET : poignée de main de vérification (`hub.verify_token` = FACEBOOK_WEBHOOK_VERIFY_TOKEN).
 * - POST : chaque événement est signé par Meta (`X-Hub-Signature-256`, HMAC-SHA256 du corps brut avec le secret de
 *   l'application) : sans signature valide, rien n'est lu. L'entreprise est déduite de la PAGE (table de routage), jamais
 *   d'une valeur du corps. Réponse 200 immédiate, traitement après la réponse (Meta réessaie si on tarde ou si on
 *   répond une erreur) ; une page inconnue est ignorée sans erreur.
 */
const TAILLE_MAX_OCTETS = 100_000;

export async function GET(requete: Request) {
  const url = new URL(requete.url);
  const attendu = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN?.trim();
  if (attendu && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === attendu) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(requete: Request) {
  const annonce = Number(requete.headers.get("content-length") ?? 0);
  if (annonce > TAILLE_MAX_OCTETS) return new NextResponse("Payload Too Large", { status: 413 });
  const corpsBrut = await requete.text();
  if (corpsBrut.length > TAILLE_MAX_OCTETS) return new NextResponse("Payload Too Large", { status: 413 });
  if (!signatureWebhookValide(corpsBrut, requete.headers.get("x-hub-signature-256"))) return new NextResponse("Forbidden", { status: 403 });

  let charge: ChargeWebhookFacebook;
  try {
    charge = JSON.parse(corpsBrut) as ChargeWebhookFacebook;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const evenements = evenementsLeadgen(charge);
  if (evenements.length > 0) {
    after(async () => {
      for (const evenement of evenements) {
        try {
          const issue = await traiterProspectFacebook(evenement);
          if (issue.statut !== "cree") {
            if (issue.statut === "ignore") console.warn(`[facebook] événement ignoré (${issue.raison})`);
            continue;
          }
          revalidatePath("/app/leads");
          if (issue.assigneEmail) {
            const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
            const { subject, html } = gabaritNouveauLeadExterne({ nom: issue.nom, source: SOURCE_FACEBOOK, message: issue.message, lien: `${base}/app/leads/${issue.leadId}` });
            await envoyerEmail({ to: issue.assigneEmail, subject, html });
          }
        } catch (erreur) {
          console.error("[facebook] traitement d'un prospect impossible :", erreur instanceof Error ? erreur.message : erreur);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
