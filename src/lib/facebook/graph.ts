import "server-only";

/**
 * Client minimal de l'API Graph de Meta pour la liaison des pages Facebook (2026-10-13). Jamais d'exception ni de jeton
 * dans un message d'erreur ou un journal : seules des phrases de l'API (qui ne répètent pas le jeton) sont renvoyées.
 */
const VERSION = "v21.0";
const DELAI_MS = 15_000;

export type ResultatGraph<T> = { ok: true; donnees: T } | { ok: false; erreur: string };

/** Permissions demandées : lire les prospects des formulaires, lister les pages de la personne, abonner la page au webhook. */
export const PERMISSIONS_FACEBOOK = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "leads_retrieval"] as const;

export function facebookConfigure(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
}

async function appeler<T>(chemin: string, init?: RequestInit): Promise<ResultatGraph<T>> {
  try {
    const reponse = await fetch(`https://graph.facebook.com/${VERSION}/${chemin}`, { ...init, signal: AbortSignal.timeout(DELAI_MS) });
    const corps = (await reponse.json().catch(() => null)) as unknown;
    if (!reponse.ok) {
      const message = (corps as { error?: { message?: unknown } } | null)?.error?.message;
      return { ok: false, erreur: typeof message === "string" ? message : `HTTP ${reponse.status}` };
    }
    return { ok: true, donnees: corps as T };
  } catch {
    return { ok: false, erreur: "Facebook injoignable." };
  }
}

export function adresseConnexionFacebook(redirectUri: string, etat: string): string {
  const parametres = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri,
    state: etat,
    scope: PERMISSIONS_FACEBOOK.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${parametres.toString()}`;
}

/** Échange le code reçu au retour contre un jeton longue durée de la personne (60 jours), puis les jetons de page qui en découlent n'expirent pas. */
export async function jetonUtilisateurLongueDuree(code: string, redirectUri: string): Promise<ResultatGraph<string>> {
  const court = await appeler<{ access_token?: string }>(
    `oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", redirect_uri: redirectUri, code })}`,
  );
  if (!court.ok || !court.donnees.access_token) return { ok: false, erreur: court.ok ? "Réponse de Facebook inattendue." : court.erreur };
  const long = await appeler<{ access_token?: string }>(
    `oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", fb_exchange_token: court.donnees.access_token })}`,
  );
  if (!long.ok || !long.donnees.access_token) return { ok: false, erreur: long.ok ? "Réponse de Facebook inattendue." : long.erreur };
  return { ok: true, donnees: long.donnees.access_token };
}

export type PageFacebook = { id: string; nom: string; jeton: string };

/** Pages que la personne administre, avec le jeton propre à chaque page. */
export async function listerPages(jetonUtilisateur: string): Promise<ResultatGraph<PageFacebook[]>> {
  const r = await appeler<{ data?: { id?: string; name?: string; access_token?: string }[] }>(
    `me/accounts?${new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: jetonUtilisateur })}`,
  );
  if (!r.ok) return r;
  const pages = (r.donnees.data ?? []).filter((p): p is { id: string; name: string; access_token: string } => Boolean(p.id && p.name && p.access_token));
  return { ok: true, donnees: pages.map((p) => ({ id: p.id, nom: p.name, jeton: p.access_token })) };
}

/** Abonne la page aux événements « leadgen » : Meta appellera notre webhook à chaque nouveau prospect. */
export async function abonnerPage(pageId: string, jetonPage: string): Promise<ResultatGraph<{ success?: boolean }>> {
  return appeler(`${encodeURIComponent(pageId)}/subscribed_apps?${new URLSearchParams({ subscribed_fields: "leadgen", access_token: jetonPage })}`, { method: "POST" });
}

export async function desabonnerPage(pageId: string, jetonPage: string): Promise<ResultatGraph<{ success?: boolean }>> {
  return appeler(`${encodeURIComponent(pageId)}/subscribed_apps?${new URLSearchParams({ access_token: jetonPage })}`, { method: "DELETE" });
}

export type ProspectFacebook = {
  id?: string;
  created_time?: string;
  form_id?: string;
  ad_name?: string;
  field_data?: { name?: string; values?: string[] }[];
};

/** Lit un prospect de formulaire avec le jeton de SA page (le webhook ne transmet que son identifiant). */
export async function lireProspect(leadgenId: string, jetonPage: string): Promise<ResultatGraph<ProspectFacebook>> {
  return appeler(`${encodeURIComponent(leadgenId)}?${new URLSearchParams({ fields: "id,created_time,form_id,ad_name,field_data", access_token: jetonPage })}`);
}
