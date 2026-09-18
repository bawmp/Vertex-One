import { Wordmark } from "@/components/wordmark";

/**
 * Personnalisation (échange du 2026-09-13) — remplace Wordmark partout où
 * une entreprise cliente peut avoir personnalisé son logo, avec repli
 * automatique sur l'identité Vertex One par défaut si aucun logo n'est
 * défini — jamais un espace vide ni une image cassée.
 *
 * `recadre` (2026-09-18) — deux façons d'afficher le même logo, jamais
 * mélangées : par défaut (en-têtes/sidebar), le logo garde son rapport
 * largeur/hauteur d'origine, contraint uniquement en hauteur (`max-h-8
 * w-auto`), comme un vrai bandeau de marque. Avec `recadre`, l'image
 * remplit tout son conteneur en carré, recadrée au centre et coins
 * arrondis (`object-cover` + `rounded-lg`) — pour un aperçu façon "tuile",
 * voir formulaire-logo.tsx. Le repli Wordmark n'est jamais recadré (un
 * pictogramme + texte étiré/rogné serait illisible).
 */
export function LogoEntreprise({
  entrepriseId,
  logoCleStockage,
  nomEntreprise,
  sombre,
  className,
  recadre,
}: {
  entrepriseId: string;
  logoCleStockage: string | null;
  nomEntreprise?: string;
  sombre?: boolean;
  className?: string;
  recadre?: boolean;
}) {
  if (!logoCleStockage) return <Wordmark sombre={sombre} className={className} />;

  const classesImage = recadre ? "size-full rounded-lg object-cover" : className ? `${className} max-h-8 w-auto` : "max-h-8 w-auto";

  // eslint-disable-next-line @next/next/no-img-element -- image externe (R2, via une redirection signée), pas un asset du projet
  return <img src={`/logo/${entrepriseId}`} alt={nomEntreprise ?? "Logo"} className={classesImage} />;
}
