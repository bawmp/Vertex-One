import "server-only";
import { construirePromptSystemeKyria } from "./contexte";

// Même traitement que Migadu/Resend/R2/CinetPay avant configuration (voir
// CLAUDE.md) : le code est réel, mais aucun appel n'a lieu tant qu'
// ANTHROPIC_API_KEY n'est pas configurée — un message clair plutôt qu'un
// crash. Appel direct à l'API (fetch), pas de SDK — même choix que pour
// CinetPay/WhatsApp Cloud API dans ce projet, pour une seule route d'appel.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Modèle volontairement économique : Kyria est exposée publiquement, sans
// authentification, à un trafic potentiellement important — un chat de
// support/vente n'a pas besoin du modèle le plus puissant. À remonter vers
// un modèle Claude plus capable ici si la qualité des réponses ne suffit
// plus, sans toucher au reste de l'intégration.
const MODELE_KYRIA = "claude-haiku-4-5-20251001";
const MAX_TOKENS_REPONSE = 500;

export function kyriaConfigure(): boolean {
  return Boolean(ANTHROPIC_API_KEY);
}

export type MessageKyria = { role: "user" | "assistant"; content: string };
export type ResultatKyria = { reponse: string; erreur?: undefined } | { reponse?: undefined; erreur: string };

/**
 * Envoie l'historique de conversation à Claude et renvoie la réponse de
 * Kyria — ne lève jamais d'exception, toujours { reponse } | { erreur }
 * (même contrat que initierPaiement(), src/lib/campay/client.ts).
 */
export async function demanderReponseKyria(messages: MessageKyria[]): Promise<ResultatKyria> {
  if (!kyriaConfigure()) {
    return { erreur: "Kyria n'est pas encore configurée — écrivez-nous plutôt via la page Contact." };
  }

  try {
    const reponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELE_KYRIA,
        max_tokens: MAX_TOKENS_REPONSE,
        system: construirePromptSystemeKyria(),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!reponse.ok) {
      const corps = await reponse.text();
      console.error(`[kyria] erreur API Anthropic (${reponse.status}) :`, corps);
      return { erreur: "Kyria rencontre un souci technique — réessayez dans un instant." };
    }

    const donnees = (await reponse.json()) as { content?: { type: string; text?: string }[] };
    const texte = donnees.content?.find((bloc) => bloc.type === "text")?.text;

    if (!texte) {
      return { erreur: "Kyria n'a pas pu formuler de réponse — réessayez avec une autre question." };
    }

    return { reponse: texte };
  } catch (erreur) {
    console.error("[kyria] échec d'appel réseau :", erreur);
    return { erreur: "Kyria est momentanément injoignable — réessayez dans un instant." };
  }
}
