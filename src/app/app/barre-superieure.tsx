/**
 * Barre supérieure de l'application : reste visible en haut du contenu, avec les
 * outils du compte (paramètres, menu utilisateur) au coin droit. Sur mobile, où la
 * barre latérale est repliée, le nom de l'entreprise s'affiche à gauche.
 */
export function BarreSuperieure({ nomEntreprise, children }: { nomEntreprise?: string; children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70 md:px-8">
      <span className="truncate text-sm font-semibold text-muted-foreground md:hidden">{nomEntreprise}</span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}
