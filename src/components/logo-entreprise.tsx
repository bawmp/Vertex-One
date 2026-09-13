import { Wordmark } from "@/components/wordmark";

/**
 * Personnalisation (échange du 2026-09-13) — remplace Wordmark partout où
 * une entreprise cliente peut avoir personnalisé son logo, avec repli
 * automatique sur l'identité Vertex One par défaut si aucun logo n'est
 * défini — jamais un espace vide ni une image cassée.
 */
export function LogoEntreprise({
  entrepriseId,
  logoCleStockage,
  nomEntreprise,
  sombre,
  className,
}: {
  entrepriseId: string;
  logoCleStockage: string | null;
  nomEntreprise?: string;
  sombre?: boolean;
  className?: string;
}) {
  if (!logoCleStockage) return <Wordmark sombre={sombre} className={className} />;

  // eslint-disable-next-line @next/next/no-img-element -- image externe (R2, via une redirection signée), pas un asset du projet
  return <img src={`/logo/${entrepriseId}`} alt={nomEntreprise ?? "Logo"} className={className ? `${className} max-h-8 w-auto` : "max-h-8 w-auto"} />;
}
