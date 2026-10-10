import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Cadre commun des formulaires de création de l'application : un en-tête avec une pastille d'icône aux couleurs de la
 * marque, un titre, une phrase d'aide, puis le formulaire dans une carte aérée qui apparaît en douceur.
 */
export function CadreFormulaire({ icone: Icone, titre, description, children, className }: { icone: LucideIcon; titre: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex max-w-xl animate-in flex-col gap-6 duration-500 fade-in slide-in-from-bottom-2", className)}>
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-marque-bleu-700 text-primary-foreground shadow-md shadow-primary/25">
          <Icone className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">{children}</div>
    </div>
  );
}

/** Titre de section à l'intérieur d'un formulaire (ex. « Coordonnées »), avec un filet discret. */
export function SectionFormulaire({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 flex w-full items-center gap-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {titre}
        <span aria-hidden className="h-px flex-1 bg-border" />
      </legend>
      {children}
    </fieldset>
  );
}
