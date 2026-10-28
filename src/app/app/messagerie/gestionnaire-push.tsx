"use client";

import { useEffect } from "react";
import { abonnerCetAppareil, EVENEMENT_NOUVEAU_MESSAGE, jouerSonMessage, pushPris } from "@/lib/messagerie/push-client";

/**
 * Invisible, monté avec le badge de la messagerie sur toutes les pages de l'application. Il :
 *  - garde l'abonnement push de cet appareil à jour (le navigateur peut le renouveler) tant que la permission est accordée ;
 *  - reçoit du service worker l'arrivée d'un message pendant que l'application est visible : joue le petit son (si la
 *    personne l'a gardé) et prévient la conversation et le badge de relire tout de suite, sans attendre leur prochain passage.
 */
export function GestionnairePush({ clePublique }: { clePublique: string | null }) {
  useEffect(() => {
    if (!pushPris()) return;

    function surMessage(evenement: MessageEvent) {
      const donnees = evenement.data as { type?: string; son?: boolean } | null;
      if (donnees?.type === "one-chat-push") {
        if (donnees.son !== false) jouerSonMessage();
        window.dispatchEvent(new Event(EVENEMENT_NOUVEAU_MESSAGE));
      }
      if (donnees?.type === "one-chat-resubscribe" && clePublique && Notification.permission === "granted") void abonnerCetAppareil(clePublique);
    }
    navigator.serviceWorker.addEventListener("message", surMessage);

    // Permission déjà accordée : on (re)enregistre le service worker et l'abonnement, silencieusement.
    if (clePublique && Notification.permission === "granted") void abonnerCetAppareil(clePublique);

    return () => navigator.serviceWorker.removeEventListener("message", surMessage);
  }, [clePublique]);

  return null;
}
