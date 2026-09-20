import { cn } from "@/lib/utils";
import { ImageLogo } from "./image-logo";

/**
 * Logo affiché sur les pages d'accueil et les en-têtes — une seule mise en
 * forme pour tous : le logo officiel de Vertex One tant que l'entreprise n'a
 * pas téléversé le sien, puis le logo de l'entreprise avec EXACTEMENT les mêmes
 * propriétés (même panneau blanc, mêmes marges, même mise à l'échelle).
 *
 * Le logo est posé sur un panneau blanc arrondi : les logos ont des couleurs
 * quelconques (le texte bleu marine de Vertex One serait illisible sur la barre
 * latérale sombre, un logo blanc invisible sur un fond clair). Il est toujours
 * affiché en entier (`object-contain`), jamais rogné ni déformé — un logo est
 * une identité, pas une illustration à recadrer.
 *
 * Tailles :
 * - `panneau` : occupe toute la largeur disponible au-dessus du nom de
 *   l'entreprise (barre latérale de l'application).
 * - `bandeau` : en-têtes compacts (espace client).
 * - `hero` : grandes pages d'accueil publiques (réservation, candidatures...).
 */
export type TailleLogo = "panneau" | "bandeau" | "hero";

const CLASSES_TAILLE: Record<TailleLogo, string> = {
  panneau: "h-32 w-full rounded-2xl px-5 py-3.5",
  bandeau: "h-16 max-w-[15rem] rounded-xl px-4 py-2",
  hero: "h-28 max-w-[20rem] rounded-2xl px-6 py-3.5",
};

export function LogoEntreprise({
  entrepriseId,
  logoCleStockage,
  nomEntreprise,
  taille = "bandeau",
  className,
}: {
  entrepriseId?: string | null;
  logoCleStockage?: string | null;
  nomEntreprise?: string;
  taille?: TailleLogo;
  className?: string;
}) {
  const logoPersonnalise = !!(entrepriseId && logoCleStockage);
  // Le logo officiel complet (avec slogan) n'est lisible qu'à grande taille.
  const officiel = taille === "bandeau" ? "/marque/logo-sans-slogan.png" : "/marque/logo.png";

  return (
    <span className={cn("flex items-center justify-center bg-white shadow-sm ring-1 ring-black/5", CLASSES_TAILLE[taille], className)}>
      <ImageLogo
        src={logoPersonnalise ? `/logo/${entrepriseId}` : officiel}
        alt={logoPersonnalise ? (nomEntreprise ?? "Logo de l'entreprise") : "Vertex One"}
        initiale={nomEntreprise?.trim().charAt(0).toUpperCase() || "V"}
      />
    </span>
  );
}
