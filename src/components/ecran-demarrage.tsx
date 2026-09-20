"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Pages publiques qui portent l'identité d'une entreprise cliente : elles ont
// leur propre logo et ne doivent pas s'ouvrir sur celui de Vertex One.
const PREFIXES_SANS_DEMARRAGE = ["/carrieres", "/reserver", "/formulaire", "/signature", "/p/"];

// Durée totale de l'animation (voir .demarrage dans globals.css), avec une petite marge.
const DUREE_MS = 2500;

/**
 * Écran de démarrage animé : le logo Vertex One se compose, puis l'écran
 * s'efface. Monté UNE fois dans la mise en page racine : il joue au chargement
 * complet d'une page (site vitrine, connexion, application, console interne,
 * espace client) mais jamais lors d'une navigation interne, qui ne remonte pas
 * la mise en page racine.
 *
 * Rendu côté serveur, donc visible dès le premier affichage ; l'effacement est
 * piloté par le CSS (il fonctionne même si JavaScript est lent ou indisponible),
 * le composant ne fait que retirer l'élément du DOM ensuite.
 */
export function EcranDemarrage() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const minuteur = setTimeout(() => setVisible(false), DUREE_MS);
    return () => clearTimeout(minuteur);
  }, []);

  if (!visible || PREFIXES_SANS_DEMARRAGE.some((prefixe) => pathname.startsWith(prefixe))) return null;

  return (
    <div className="demarrage" role="status" aria-label="Chargement de Vertex One">
      <div aria-hidden className="demarrage-halo demarrage-halo-bleu" />
      <div aria-hidden className="demarrage-halo demarrage-halo-orange" />

      <div className="demarrage-logo">
        {/* Le logo est décomposé en quatre couches de même taille (voir public/marque) : leur superposition redonne exactement le logo officiel, et chacune s'anime à son tour. */}
        {/* eslint-disable @next/next/no-img-element -- couches statiques du logo, animées en CSS */}
        <img src="/marque/couche-bleu.png" alt="" className="demarrage-couche demarrage-bleu" fetchPriority="high" />
        <img src="/marque/couche-orange.png" alt="" className="demarrage-couche demarrage-orange" fetchPriority="high" />
        <img src="/marque/couche-nom.png" alt="" className="demarrage-couche demarrage-nom" fetchPriority="high" />
        <img src="/marque/couche-slogan.png" alt="" className="demarrage-couche demarrage-slogan" fetchPriority="high" />
        {/* eslint-enable @next/next/no-img-element */}
        <span aria-hidden className="demarrage-brillance" />
      </div>

      <div aria-hidden className="demarrage-barre">
        <span />
      </div>
    </div>
  );
}
