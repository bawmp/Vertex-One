export type EvenementLeadgen = { pageId: string; leadgenId: string };

export type ChargeWebhookFacebook = {
  object?: string;
  entry?: { changes?: { field?: string; value?: { page_id?: string | number; leadgen_id?: string | number } }[] }[];
};

/** Nom des cookies de la liaison (httpOnly) : le nonce de l'état OAuth, et la liste chiffrée des pages à choisir. */
export const COOKIE_NONCE = "vx-fb-nonce";
export const COOKIE_PAGES = "vx-fb-pages";

/**
 * Extrait les « nouveau prospect » d'une charge de webhook Meta. Seuls les identifiants strictement numériques sont
 * retenus (ils sont ensuite utilisés dans une adresse de l'API Graph) ; tout le reste de la charge est ignoré.
 */
export function evenementsLeadgen(charge: ChargeWebhookFacebook): EvenementLeadgen[] {
  if (charge.object !== "page") return [];
  const evenements: EvenementLeadgen[] = [];
  for (const entree of charge.entry ?? []) {
    for (const changement of entree.changes ?? []) {
      if (changement.field !== "leadgen") continue;
      const pageId = changement.value?.page_id !== undefined ? String(changement.value.page_id) : "";
      const leadgenId = changement.value?.leadgen_id !== undefined ? String(changement.value.leadgen_id) : "";
      if (/^\d{5,25}$/.test(pageId) && /^\d{5,25}$/.test(leadgenId)) evenements.push({ pageId, leadgenId });
    }
  }
  return evenements;
}
