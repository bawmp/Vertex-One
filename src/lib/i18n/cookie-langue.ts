import type { Langue } from "@/lib/session";

/** Nom du cookie qui mémorise la langue choisie (voir src/lib/i18n/langue.ts) ; posé côté navigateur, lu côté serveur. */
export const COOKIE_LANGUE = "vertexone-langue";

/** Mémorise la langue pour un an : elle sert aux pages sans compte (site vitrine, connexion) et se lit avant toute session. */
export function memoriserLangue(langue: Langue): void {
  document.cookie = `${COOKIE_LANGUE}=${langue}; path=/; max-age=31536000; samesite=lax`;
}
