"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";

const CLE_REPLIE = "vertexone.sidebar.repliee";
const EVENEMENT_REPLIE = "vertexone:sidebar-repliee";

// Préférence d'affichage stockée dans le navigateur (jamais côté serveur) :
// lue via useSyncExternalStore pour rester cohérente entre onglets et sans
// setState dans un effet. Toute lecture/écriture est protégée — le stockage
// peut être indisponible (navigation privée, données de site bloquées).
function abonnerRepli(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT_REPLIE, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT_REPLIE, rappel);
  };
}

function lireRepli(): boolean {
  try {
    return window.localStorage.getItem(CLE_REPLIE) === "1";
  } catch {
    return false;
  }
}

function ecrireRepli(valeur: boolean) {
  try {
    window.localStorage.setItem(CLE_REPLIE, valeur ? "1" : "0");
  } catch {
    // Préférence non mémorisable : le repli fonctionne alors le temps de la page seulement.
  }
  window.dispatchEvent(new Event(EVENEMENT_REPLIE));
}

/**
 * Cadre de navigation de l'application. Sur téléphone : menu coulissant (depuis la droite)
 * ouvert par un bouton flottant dans le coin inférieur droit. À partir de `md` : barre latérale fixe que
 * l'utilisateur peut réduire en une fine bande dans le coin, puis rouvrir. Le
 * contenu de la barre (liens, menu utilisateur) reste rendu côté serveur par
 * layout.tsx et passé ici en `children` — aucune logique de permission n'est
 * déplacée côté client.
 */
export function CadreSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Mémorise la page pour laquelle le menu a été ouvert : dès que la page
  // change, il se referme sans effet de bord ni setState dans un effet.
  const [ouvertPour, setOuvertPour] = useState<string | null>(null);
  const ouvert = ouvertPour === pathname;
  const replie = useSyncExternalStore(abonnerRepli, lireRepli, () => false);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvertPour(null);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvertPour(pathname)}
        aria-label="Ouvrir le menu"
        aria-expanded={ouvert}
        className="fixed bottom-4 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground shadow-lg ring-1 ring-sidebar-border md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {ouvert ? <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOuvertPour(null)} aria-hidden /> : null}

      <nav
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOuvertPour(null);
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-1 border-l border-sidebar-border bg-sidebar p-4 transition-transform duration-200",
          "md:sticky md:top-0 md:z-auto md:h-screen md:max-w-none md:shrink-0 md:translate-x-0 md:border-l-0 md:border-r md:transition-none",
          replie ? "md:w-14 md:items-center md:p-2" : "md:w-64",
          ouvert ? "translate-x-0" : "translate-x-full"
        )}
      >
        <button
          type="button"
          onClick={() => setOuvertPour(null)}
          aria-label="Fermer le menu"
          className="absolute right-6 top-6 z-10 flex size-8 items-center justify-center rounded-lg bg-white text-stone-500 shadow-sm ring-1 ring-black/10 hover:text-stone-800 md:hidden"
        >
          <X className="size-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => ecrireRepli(!replie)}
          aria-label={replie ? "Déployer la barre latérale" : "Réduire la barre latérale"}
          title={replie ? "Déployer la barre latérale" : "Réduire la barre latérale"}
          className={cn(
            "hidden items-center justify-center rounded-lg md:flex",
            // Déployée : petite pastille blanche dans le coin du panneau du logo. Réduite : bouton seul sur la bande sombre.
            replie
              ? "size-9 text-sidebar-foreground/80 hover:bg-sidebar-accent"
              : "absolute right-6 top-6 z-10 size-8 bg-white text-stone-500 shadow-sm ring-1 ring-black/10 hover:text-stone-800"
          )}
        >
          {replie ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
        </button>

        <div className={cn("flex min-h-0 w-full flex-1 flex-col gap-1", replie && "md:hidden")}>{children}</div>
      </nav>
    </>
  );
}
