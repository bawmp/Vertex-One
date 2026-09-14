"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime l'entrée d'un bloc quand il devient visible au défilement — via
 * IntersectionObserver plutôt qu'une librairie d'animation (aucune dans ce
 * projet ; `tw-animate-css` est déjà importé dans globals.css, fournissant
 * les classes `animate-in`/`fade-in`/`slide-in-from-*` utilisées ici).
 * Se déclenche une seule fois (jamais en boucle en remontant/redescendant).
 * `delai` (ms) permet un effet de cascade sur une grille de cartes.
 *
 * `as` choisit la balise du conteneur ("div" par défaut, "li" pour animer
 * un élément à l'intérieur d'une <ul> sans casser la validité du HTML).
 */
export function Reveal({
  children,
  delai = 0,
  className,
  as: Balise = "div",
}: {
  children: React.ReactNode;
  delai?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- affiche le contenu directement, une seule fois au montage, quand l'utilisateur a demandé de réduire les animations.
      setVisible(true);
      return;
    }

    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (entree.isIntersecting) {
          setVisible(true);
          observateur.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <Balise
      ref={ref}
      className={visible ? `animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700 ${className ?? ""}` : `opacity-0 ${className ?? ""}`}
      style={visible ? { animationDelay: `${delai}ms` } : undefined}
    >
      {children}
    </Balise>
  );
}
