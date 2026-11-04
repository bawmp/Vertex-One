import { initiales } from "@/lib/rh/photo-affichage";

const TAILLES = {
  petit: "size-9 text-xs",
  moyen: "size-14 text-base",
  grand: "size-24 text-2xl",
  carte: "size-16 text-xl ring-4 ring-card shadow-md",
  hero: "size-28 text-4xl ring-4 ring-card shadow-lg sm:size-32",
} as const;

/**
 * Photo d'un collaborateur ou de ses initiales à défaut. La photo vient de la route contrôlée /app/rh/photo/... (jamais d'un lien public) ;
 * `adresse` est null quand la personne n'a pas de photo. La taille « hero » est celle de l'en-tête de fiche (liseré de la couleur de la carte).
 */
export function AvatarCollaborateur({ nom, adresse, taille = "moyen", version }: { nom: string; adresse: string | null; taille?: keyof typeof TAILLES; version?: string }) {
  const classes = `${TAILLES[taille]} shrink-0 rounded-full`;
  if (adresse) {
    // eslint-disable-next-line @next/next/no-img-element -- photo servie par une route authentifiée, jamais optimisable par next/image
    return <img src={version ? `${adresse}?v=${encodeURIComponent(version)}` : adresse} alt={`Photo de ${nom}`} className={`${classes} bg-muted object-cover`} />;
  }
  return (
    <span aria-hidden className={`${classes} flex items-center justify-center bg-linear-to-br from-marque-bleu-100 to-marque-orange-100 font-semibold text-marque-bleu-800 dark:from-marque-bleu-800 dark:to-marque-orange-900 dark:text-marque-bleu-50`}>
      {initiales(nom)}
    </span>
  );
}
