/**
 * Identité de l'entreprise en haut de page : son logo s'il en a un, sinon une
 * pastille à son initiale. Jamais le logo « Vertex One » de repli, qui serait
 * trompeur sur la page d'un recruteur.
 */
export function EnteteEntreprise({ entrepriseId, nomEntreprise, logoCleStockage }: { entrepriseId: string; nomEntreprise: string; logoCleStockage: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {logoCleStockage ? (
        // eslint-disable-next-line @next/next/no-img-element -- image externe (R2, via une redirection signée), pas un asset du projet
        <img src={`/logo/${entrepriseId}`} alt="" className="size-11 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-stone-200" />
      ) : (
        <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
          {nomEntreprise.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-lg font-semibold tracking-tight text-stone-800">{nomEntreprise}</span>
    </div>
  );
}
