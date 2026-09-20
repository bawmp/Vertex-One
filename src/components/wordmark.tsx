import { cn } from "@/lib/utils";

/**
 * Logo officiel Vertex One, affiché tel quel (sans panneau) sur un fond clair :
 * en-tête et pied du site vitrine, connexion sur mobile. Sur un fond sombre ou
 * coloré, utiliser <LogoEntreprise /> (panneau blanc) : le texte bleu marine du
 * logo n'y serait pas lisible.
 *
 * `slogan` : la version complète (avec « Digital Solutions | Innovation |
 * Africa ») n'est lisible qu'à grande taille — les en-têtes utilisent la
 * version sans slogan.
 */
export function Wordmark({ className, slogan = false }: { className?: string; slogan?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset statique du logo officiel
    <img src={slogan ? "/marque/logo.png" : "/marque/logo-sans-slogan.png"} alt="Vertex One" className={cn("h-12 w-auto", className)} />
  );
}
