import { initiales } from "@/lib/rh/photo-affichage";

const TAILLES = { petit: "size-9 text-xs", moyen: "size-14 text-base", grand: "size-24 text-2xl" } as const;

/**
 * Photo d'un collaborateur ou de ses initiales à défaut. La photo vient de la route contrôlée /app/rh/photo/... (jamais d'un lien public) ;
 * `adresse` est null quand la personne n'a pas de photo.
 */
export function AvatarCollaborateur({ nom, adresse, taille = "moyen", version }: { nom: string; adresse: string | null; taille?: keyof typeof TAILLES; version?: string }) {
  const classes = `${TAILLES[taille]} shrink-0 rounded-full`;
  if (adresse) {
    // eslint-disable-next-line @next/next/no-img-element -- photo servie par une route authentifiée, jamais optimisable par next/image
    return <img src={version ? `${adresse}?v=${encodeURIComponent(version)}` : adresse} alt={`Photo de ${nom}`} className={`${classes} object-cover`} />;
  }
  return (
    <span aria-hidden className={`${classes} flex items-center justify-center bg-primary/10 font-semibold text-primary`}>
      {initiales(nom)}
    </span>
  );
}
