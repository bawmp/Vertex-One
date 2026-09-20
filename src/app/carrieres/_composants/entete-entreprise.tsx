import { LogoEntreprise } from "@/components/logo-entreprise";

/**
 * Identité de l'entreprise en haut de page : son logo (même panneau que partout
 * ailleurs), au-dessus de son nom. Sans logo, une pastille à son initiale — jamais
 * le logo « Vertex One » de repli, qui serait trompeur sur la page d'un recruteur.
 */
export function EnteteEntreprise({ entrepriseId, nomEntreprise, logoCleStockage }: { entrepriseId: string; nomEntreprise: string; logoCleStockage: string | null }) {
  if (logoCleStockage) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <LogoEntreprise taille="bandeau" entrepriseId={entrepriseId} logoCleStockage={logoCleStockage} nomEntreprise={nomEntreprise} />
        <span className="px-1 text-base font-semibold tracking-tight text-stone-800">{nomEntreprise}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
        {nomEntreprise.trim().charAt(0).toUpperCase()}
      </span>
      <span className="text-lg font-semibold tracking-tight text-stone-800">{nomEntreprise}</span>
    </div>
  );
}
