/**
 * Limite de débit par clé d'API : 30 appels par minute (fenêtre glissante), en mémoire du processus. C'est un
 * garde-fou contre une boucle ou une fuite de clé, PAS une protection absolue : sur plusieurs instances serverless
 * chacune a sa propre mémoire. Le vrai recours contre une clé volée reste sa révocation immédiate dans Paramètres.
 */
const FENETRE_MS = 60_000;
const MAX_APPELS = 30;
const appels = new Map<string, number[]>();

export function autoriserAppel(cleId: string, maintenant = Date.now()): boolean {
  const recents = (appels.get(cleId) ?? []).filter((t) => maintenant - t < FENETRE_MS);
  if (recents.length >= MAX_APPELS) {
    appels.set(cleId, recents);
    return false;
  }
  recents.push(maintenant);
  appels.set(cleId, recents);
  return true;
}

/** Pour les tests. */
export function reinitialiserLimites() {
  appels.clear();
}
