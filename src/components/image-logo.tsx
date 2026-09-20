"use client";

import { useState } from "react";

/**
 * Image d'un logo avec repli : si le fichier devient inaccessible (stockage
 * indisponible, objet supprimé), une pastille à l'initiale de l'entreprise
 * remplace l'icône d'image brisée du navigateur — un visiteur ne doit jamais
 * voir « TEST Marque SARL » en texte alternatif à la place d'un logo.
 */
export function ImageLogo({ src, alt, initiale }: { src: string; alt: string; initiale: string }) {
  const [echec, setEchec] = useState(false);

  if (echec) {
    return (
      <span role="img" aria-label={alt} className="flex size-full items-center justify-center rounded-lg bg-primary text-3xl font-bold text-primary-foreground">
        {initiale}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo servi par une redirection signée (R2) ou asset statique : next/image n'apporterait rien ici
    <img
      src={src}
      alt={alt}
      className="size-full object-contain"
      onError={() => setEchec(true)}
      // Une erreur survenue avant l'hydratation de React ne déclenche jamais onError : on la détecte ici.
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) setEchec(true);
      }}
    />
  );
}
