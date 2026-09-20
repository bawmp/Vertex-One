"use client";

import { useEffect, useRef, useState } from "react";

const INTERVALLE_ACTIF_MS = 30_000;
const INTERVALLE_ARRIERE_PLAN_MS = 90_000;

/**
 * Badge des messages non lus dans le menu, sur toutes les pages de l'application. Interroge le serveur toutes les
 * 30 s (90 s onglet masqué) ; cet appel est aussi ce qui indique aux collègues que vous êtes en ligne. Le total
 * est repris dans le titre de l'onglet, et une notification du navigateur prévient quand il augmente pendant que
 * l'onglet est masqué (si la personne l'a autorisée).
 */
export function BadgeMessagerie() {
  const [total, setTotal] = useState(0);
  const precedent = useRef(0);

  useEffect(() => {
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout>;
    const titreBase = document.title.replace(/^\(\d+\+?\)\s*/, "");

    async function verifier() {
      const visible = document.visibilityState === "visible";
      try {
        const reponse = await fetch("/app/messagerie/non-lus", { cache: "no-store" });
        if (reponse.ok && !arrete) {
          const { total: nouveau } = (await reponse.json()) as { total: number };
          if (nouveau > precedent.current && !visible && typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("One Chat", { body: nouveau === 1 ? "Vous avez 1 nouveau message" : `Vous avez ${nouveau} nouveaux messages`, tag: "one-chat-non-lus" });
          }
          precedent.current = nouveau;
          setTotal(nouveau);
          document.title = nouveau > 0 ? `(${nouveau > 99 ? "99+" : nouveau}) ${titreBase}` : titreBase;
        }
      } catch {
        // Réseau coupé : on réessaiera au prochain passage.
      }
      if (!arrete) minuteur = setTimeout(verifier, visible ? INTERVALLE_ACTIF_MS : INTERVALLE_ARRIERE_PLAN_MS);
    }

    verifier();
    return () => {
      arrete = true;
      clearTimeout(minuteur);
      document.title = titreBase;
    };
  }, []);

  if (total <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-marque-orange px-1.5 text-xs font-semibold text-white" aria-label={`${total} message${total > 1 ? "s" : ""} non lu${total > 1 ? "s" : ""}`}>
      {total > 99 ? "99+" : total}
    </span>
  );
}
