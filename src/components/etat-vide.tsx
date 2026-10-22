import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * État vide d'une liste : une icône dans un rond teinté, un titre, une phrase qui dit quoi faire ensuite et, au besoin,
 * l'action (un bouton passé en `children`). Remplace la ligne grise « Aucun … pour le moment. ».
 */
export function EtatVide({ icone: Icone, titre, description, className, children }: { icone: LucideIcon; titre: string; description?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center animate-in fade-in zoom-in-95 duration-300 fill-mode-both", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
        <Icone className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium text-foreground">{titre}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
