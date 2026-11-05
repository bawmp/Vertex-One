/**
 * Illustration de fond du bandeau de connexion (mobile) : les chevrons du logo, agrandis et en transparence, des
 * cercles concentriques et quelques points orange. Purement décorative (aria-hidden) ; l'orange vient du jeton de marque.
 */
export function FondMarque({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 390 176" preserveAspectRatio="xMidYMid slice" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
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
