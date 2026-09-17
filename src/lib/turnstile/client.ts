import "server-only";

// Même traitement que Migadu/Resend/R2/CinetPay/Kyria avant configuration
// (voir CLAUDE.md) : le code est réel, mais aucune vérification n'a lieu
// tant que TURNSTILE_SECRET_KEY n'est pas configurée — une soumission
// publique reste acceptée sans CAPTCHA plutôt que de bloquer tout le monde
// en attendant la clé. Appel direct à l'API (fetch), pas de SDK — même
// choix que pour CinetPay/WhatsApp/Anthropic dans ce projet.
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigure(): boolean {
  return Boolean(TURNSTILE_SECRET_KEY);
}

/**
 * Vérifie un jeton Turnstile soumis depuis le widget public
 * (src/app/formulaire/[slug]/formulaire-remplissage-public.tsx). Ne lève
 * jamais d'exception : une erreur réseau côté Cloudflare refuse la
 * soumission plutôt que de l'accepter en silence (fail-closed, contrairement
 * à turnstileConfigure() qui fail-open tant que la clé n'existe pas du
 * tout — deux situations différentes : « pas configuré » vs « configuré
 * mais indisponible »).
 */
export async function verifierTurnstile(jeton: string): Promise<boolean> {
  if (!turnstileConfigure()) return true;
  if (!jeton) return false;

  try {
    const reponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: TURNSTILE_SECRET_KEY, response: jeton }),
    });
    const resultat = (await reponse.json()) as { success: boolean };
    return resultat.success === true;
  } catch (erreur) {
    console.error("[turnstile] échec de vérification :", erreur);
    return false;
  }
}
