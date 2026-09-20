"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Propose d'activer les notifications du navigateur (nouveaux messages pendant que l'onglet est masqué). Elles ne
 * fonctionnent que tant que Vertex One est ouvert dans un onglet : pour être prévenu application fermée, les
 * messages directs restés sans réponse sont aussi envoyés par email.
 */
export function ActiverNotifications() {
  const [etat, setEtat] = useState<NotificationPermission | "indisponible">("indisponible");

  // Lecture de la permission après le montage : elle n'existe pas côté serveur (évite un écart d'hydratation).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'état du navigateur n'est connu qu'après le montage.
    setEtat(typeof Notification === "undefined" ? "indisponible" : Notification.permission);
  }, []);

  if (etat !== "default") return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => Notification.requestPermission().then(setEtat)} className="w-full">
      <Bell data-icon="inline-start" aria-hidden />
      Activer les notifications
    </Button>
  );
}
