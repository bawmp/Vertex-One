"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre de 0 vers `valeur` quand il entre dans le viewport — pour
 * les statistiques du site vitrine (prix, durée d'essai). Se déclenche une
 * seule fois. `formater` contrôle l'affichage final (ex. séparateur des
 * milliers) ; pendant l'animation, le nombre brut est affiché sans lui pour
 * rester simple.
 */
export function CompteurAnime({ valeur, duree = 900, formater }: { valeur: number; duree?: number; formater?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [affiche, setAffiche] = useState(0);
  const [termine, setTermine] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- affiche directement la valeur finale, une seule fois au montage, quand l'utilisateur a demandé de réduire les animations.
      setAffiche(valeur);
      setTermine(true);
      return;
    }

    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (!entree.isIntersecting) return;
        observateur.disconnect();
        const debut = performance.now();
        function etape(maintenant: number) {
          const progres = Math.min((maintenant - debut) / duree, 1);
          setAffiche(Math.round(valeur * progres));
          if (progres < 1) requestAnimationFrame(etape);
          else setTermine(true);
        }
        requestAnimationFrame(etape);
      },
      { threshold: 0.5 }
    );
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [valeur, duree]);

  return <span ref={ref}>{termine && formater ? formater(valeur) : affiche.toLocaleString("fr-FR")}</span>;
}
