"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre de sa valeur précédente jusqu'à `valeur` (~600ms, ease-out) — purement cosmétique : la valeur
 * affichée en fin d'animation, ou immédiatement si `prefers-reduced-motion` est actif, est toujours `valeur`.
 * Props primitives uniquement (jamais une fonction de formatage) pour rester une dépendance d'effet stable
 * d'un rendu à l'autre — voir src/lib/facturation/calcul.ts::formaterFCFA pour l'équivalent non animé.
 */
export function NombreAnime({
  valeur,
  prefixe = "",
  suffixe = "",
  locale = "fr-FR",
}: {
  valeur: number;
  prefixe?: string;
  suffixe?: string;
  locale?: string;
}) {
  const [affiche, setAffiche] = useState(valeur);
  const precedent = useRef(0);
  const premierRendu = useRef(true);

  useEffect(() => {
    const reduit = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const depart = premierRendu.current ? 0 : precedent.current;
    premierRendu.current = false;
    const duree = reduit ? 0 : 600;
    const debut = performance.now();
    let frame: number;

    // setAffiche() s'exécute dans ce callback planifié par requestAnimationFrame, jamais directement dans le
    // corps de l'effet — la première frame suffit à afficher la valeur finale quand duree vaut 0 (mouvement
    // réduit).
    function etape(maintenant: number) {
      const progres = duree === 0 ? 1 : Math.min(1, (maintenant - debut) / duree);
      const facilite = 1 - Math.pow(1 - progres, 3);
      setAffiche(Math.round(depart + (valeur - depart) * facilite));
      if (progres < 1) frame = requestAnimationFrame(etape);
    }
    frame = requestAnimationFrame(etape);
    precedent.current = valeur;
    return () => cancelAnimationFrame(frame);
  }, [valeur]);

  return (
    <>
      {prefixe}
      {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(affiche)}
      {suffixe}
    </>
  );
}
