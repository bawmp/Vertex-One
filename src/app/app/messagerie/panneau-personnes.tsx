"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Collegue } from "@/lib/messagerie/acces";
import { useT } from "@/lib/i18n/contexte";

const INTERVALLE_MS = 30_000;

export type DmParCollegue = Record<string, { canalId: string; nonLus: number }>;

/**
 * Collègues avec qui discuter : un point vert pour ceux qui sont en ligne (actifs il y a moins de 2 minutes,
 * rafraîchi toutes les 30 s), le badge de non-lus de la conversation directe s'il y en a une, et un clic ouvre
 * (ou crée) la conversation directe.
 */
export function PanneauPersonnes({ collegues: initiaux, dmParCollegue, canalActifId }: { collegues: Collegue[]; dmParCollegue: DmParCollegue; canalActifId: string | null }) {
  const t = useT();
  const [collegues, setCollegues] = useState(initiaux);

  useEffect(() => {
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout>;
    async function rafraichir() {
      if (document.visibilityState === "visible") {
        try {
          const reponse = await fetch("/app/messagerie/collegues", { cache: "no-store" });
          if (reponse.ok && !arrete) setCollegues(((await reponse.json()) as { collegues: Collegue[] }).collegues);
        } catch {
          // Réseau coupé : on réessaiera.
        }
      }
      if (!arrete) minuteur = setTimeout(rafraichir, INTERVALLE_MS);
    }
    minuteur = setTimeout(rafraichir, INTERVALLE_MS);
    return () => {
      arrete = true;
      clearTimeout(minuteur);
    };
  }, []);

  if (collegues.length === 0) return <p className="px-2.5 text-xs text-muted-foreground">{t("Vous êtes seul(e) pour l'instant. Invitez des collègues dans Paramètres → Équipe.")}</p>;

  // Les personnes en ligne d'abord, puis l'ordre alphabétique déjà fourni par le serveur.
  const ordonnes = [...collegues].sort((a, b) => Number(b.enLigne) - Number(a.enLigne));

  return (
    <nav aria-label={t("Messages directs")} className="flex flex-col gap-0.5">
      {ordonnes.map((c) => {
        const dm = dmParCollegue[c.id];
        const actif = dm?.canalId === canalActifId;
        const nombre = actif ? 0 : (dm?.nonLus ?? 0);
        return (
          <Link
            key={c.id}
            href={dm ? `/app/messagerie?canal=${dm.canalId}` : `/app/messagerie?dm=${c.id}`}
            aria-current={actif ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${actif ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={`size-2.5 shrink-0 rounded-full ${c.enLigne ? "bg-emerald-500" : "bg-muted-foreground/30"}`} role="img" aria-label={c.enLigne ? t("En ligne") : t("Hors ligne")} />
              <span className="truncate">{c.nom}</span>
            </span>
            {nombre > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marque-orange px-1.5 text-xs font-semibold text-white">{nombre > 99 ? "99+" : nombre}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
