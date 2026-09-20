"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Menu déroulant minimal (aucune dépendance) : s'ouvre au clic, se ferme au
 * clic à l'extérieur, avec Échap (le focus revient alors sur le bouton), ou
 * quand le contenu appelle `fermer` (ex. après avoir cliqué sur un lien).
 * Les états ARIA (`aria-expanded`, `aria-haspopup`) suivent l'état réel.
 */
export function MenuDeroulant({
  etiquette,
  declencheur,
  children,
  alignement = "droite",
  classesBouton,
}: {
  /** Nom accessible du bouton (le contenu visuel est souvent une icône ou un avatar). */
  etiquette: string;
  declencheur: React.ReactNode;
  children: (fermer: () => void) => React.ReactNode;
  alignement?: "droite" | "gauche";
  classesBouton?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="relative">
      <button
        ref={bouton}
        type="button"
        aria-label={etiquette}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          ouvert && "bg-muted",
          classesBouton
        )}
      >
        {declencheur}
      </button>

      {ouvert ? (
        <div
          role="menu"
          className={cn(
            "animate-in fade-in zoom-in-95 slide-in-from-top-1 absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] origin-top rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl duration-150",
            alignement === "droite" ? "right-0" : "left-0"
          )}
        >
          {children(() => setOuvert(false))}
        </div>
      ) : null}
    </div>
  );
}

/** Ligne d'un menu déroulant : lien ou bouton, même apparence. */
export const CLASSES_LIGNE_MENU =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60";

export function SeparateurMenu() {
  return <div role="separator" className="my-1.5 h-px bg-border" />;
}
