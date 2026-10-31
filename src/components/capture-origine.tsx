"use client";

import { useEffect } from "react";
import { COOKIE_ORIGINE, DUREE_COOKIE_ORIGINE_JOURS, lireOrigine, origineDepuisNavigation, serialiserOrigine } from "@/lib/acquisition/origine";

/**
 * Mémorise d'où vient le visiteur (lien de campagne, parrainage, référent) dans un cookie de 60 jours, pour que son inscription — même
 * quelques jours plus tard — soit rattachée à la campagne qui l'a amené. Ne rend rien. Une origine déjà mémorisée n'est remplacée que par
 * un lien de campagne explicite, jamais par un simple retour direct.
 */
export function CaptureOrigine() {
  useEffect(() => {
    try {
      const { origine, explicite } = origineDepuisNavigation(window.location.search, document.referrer, window.location.hostname);
      const existant = lireOrigine(
        document.cookie
          .split("; ")
          .find((c) => c.startsWith(`${COOKIE_ORIGINE}=`))
          ?.slice(COOKIE_ORIGINE.length + 1),
      );
      if (existant && !explicite) return;
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${COOKIE_ORIGINE}=${encodeURIComponent(serialiserOrigine(origine))}; max-age=${DUREE_COOKIE_ORIGINE_JOURS * 86_400}; path=/; samesite=lax${secure}`;
    } catch {
      /* cookies refusés : l'inscription fonctionne, simplement sans origine */
    }
  }, []);
  return null;
}
