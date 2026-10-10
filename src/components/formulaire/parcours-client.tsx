import type { ComponentProps } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Petite frise « où en suis-je ? » des pages envoyées au client (consulter → répondre → régler). La page courante est
 * pleine et orange, les étapes passées portent une coche. Purement visuelle : l'état vient de la page, jamais du navigateur.
 */
export function EtapesClient({ etapes, active }: { etapes: string[]; active: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progression">
      {etapes.map((libelle, i) => {
        const faite = i < active;
        const courante = i === active;
        return (
          <li key={libelle} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className="flex items-center gap-2">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors", faite ? "bg-emerald-500 text-white" : courante ? "bg-marque-orange text-white ring-4 ring-marque-orange/20" : "bg-muted text-muted-foreground")}>
                {faite ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-xs font-medium", courante ? "text-foreground" : "text-muted-foreground")}>{libelle}</span>
            </span>
            {i < etapes.length - 1 ? <span aria-hidden className={cn("h-px flex-1", faite ? "bg-emerald-500" : "bg-border")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Grand bouton de décision (accepter / refuser / payer) : icône, titre et une ligne d'explication, bien visible au pouce. */
export function BoutonDecision({ icone: Icone, titre, detail, principal, chargement, className, ...proprietes }: ComponentProps<"button"> & { icone: LucideIcon; titre: string; detail?: string; principal?: boolean; chargement?: boolean }) {
  return (
    <button
      type="button"
      {...proprietes}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left outline-none transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-primary/25 active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
        principal ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25" : "border-border bg-background shadow-xs hover:border-primary/40",
        className
      )}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", principal ? "bg-white/15" : "bg-muted text-muted-foreground")}>
        {chargement ? <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icone className="size-5" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{titre}</span>
        {detail ? <span className={cn("text-xs", principal ? "text-primary-foreground/80" : "text-muted-foreground")}>{detail}</span> : null}
      </span>
    </button>
  );
}
