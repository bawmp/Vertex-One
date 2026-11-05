/**
 * Illustration de fond des écrans de connexion : les chevrons du logo, agrandis et en transparence, des cercles
 * concentriques et quelques points orange. Purement décorative (aria-hidden) ; l'orange vient du jeton de marque.
 * `bandeau` : bandeau du mobile (large et bas) ; `panneau` : panneau de gauche du bureau (haut).
 */
export function FondMarque({ className, variante = "bandeau" }: { className?: string; variante?: "bandeau" | "panneau" }) {
  const propres = { "aria-hidden": true, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", className } as const;

  if (variante === "panneau") {
    return (
      <svg {...propres} viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice">
        {/* Chevrons du logo, en haut à droite */}
        <path d="M372 -60 L506 250 L640 -60" stroke="white" strokeOpacity="0.14" strokeWidth="26" />
        <path d="M440 -60 L574 250 L708 -60" stroke="white" strokeOpacity="0.08" strokeWidth="26" />
        <path d="M406 -60 L540 250 L674 -60" stroke="var(--marque-orange)" strokeOpacity="0.75" strokeWidth="4" />

        {/* Cercles concentriques, en bas à droite */}
        <circle cx="640" cy="800" r="130" stroke="white" strokeOpacity="0.13" strokeWidth="2" />
        <circle cx="640" cy="800" r="230" stroke="white" strokeOpacity="0.09" strokeWidth="2" />
        <circle cx="640" cy="800" r="330" stroke="white" strokeOpacity="0.06" strokeWidth="2" />

        {/* Points d'accent */}
        <circle cx="560" cy="430" r="5" fill="var(--marque-orange)" fillOpacity="0.9" />
        <circle cx="596" cy="330" r="3" fill="white" fillOpacity="0.55" />
        <circle cx="30" cy="150" r="3" fill="white" fillOpacity="0.5" />
      </svg>
    );
  }

  return (
    <svg {...propres} viewBox="0 0 390 176" preserveAspectRatio="xMidYMid slice">
      {/* Chevrons du logo, côté droit */}
      <path d="M232 -24 L304 126 L376 -24" stroke="white" strokeOpacity="0.16" strokeWidth="16" />
      <path d="M268 -24 L340 126 L412 -24" stroke="white" strokeOpacity="0.09" strokeWidth="16" />
      <path d="M250 -24 L322 126 L394 -24" stroke="var(--marque-orange)" strokeOpacity="0.75" strokeWidth="3" />

      {/* Cercles concentriques, côté gauche */}
      <circle cx="12" cy="168" r="46" stroke="white" strokeOpacity="0.14" strokeWidth="1.5" />
      <circle cx="12" cy="168" r="82" stroke="white" strokeOpacity="0.1" strokeWidth="1.5" />
      <circle cx="12" cy="168" r="118" stroke="white" strokeOpacity="0.07" strokeWidth="1.5" />

      {/* Points d'accent */}
      <circle cx="58" cy="44" r="3.5" fill="var(--marque-orange)" fillOpacity="0.9" />
      <circle cx="96" cy="22" r="2" fill="white" fillOpacity="0.6" />
      <circle cx="22" cy="86" r="2" fill="white" fillOpacity="0.5" />
    </svg>
  );
}
