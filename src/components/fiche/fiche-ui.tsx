import type { ComponentType, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * Briques de la fiche collaborateur : un héro à bannière (dégradé de la charte, halo orange), des cartes à pastille d'icône, des lignes
 * d'information et des tuiles de chiffres. Tout vient des jetons de la charte (`marque-bleu-*`, `marque-orange-*`), jamais d'une couleur en dur.
 */

/* ------------------------------------------------------------------ Héro */

export type PuceHero = { icone: Icone; texte: ReactNode };

export function FicheHero({ avatar, nom, sousTitre, badges, puces = [], actions, ruban }: { avatar: ReactNode; nom: string; sousTitre?: ReactNode; badges?: ReactNode; puces?: PuceHero[]; actions?: ReactNode; ruban?: ReactNode }) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-16px_rgba(0,0,0,0.18)] duration-500 fill-mode-both">
      <div className="relative h-32 overflow-hidden bg-linear-to-br from-marque-bleu-900 via-marque-bleu-700 to-marque-bleu-500 sm:h-40">
        <div aria-hidden className="absolute -top-20 -right-10 size-72 rounded-full bg-marque-orange/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-28 left-1/4 size-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="absolute inset-0 opacity-70 [background-image:radial-gradient(color-mix(in_oklab,white_18%,transparent)_1px,transparent_1px)] [background-size:18px_18px]" />
        {ruban ? <div className="absolute top-4 right-4 sm:top-5 sm:right-6">{ruban}</div> : null}
      </div>
      <div className="relative px-5 pb-5 sm:px-8 sm:pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
            <div className="relative z-10 -mt-14 shrink-0 sm:-mt-16">{avatar}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:pt-4">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{nom}</h1>
              {sousTitre ? <p className="text-sm text-muted-foreground sm:text-base">{sousTitre}</p> : null}
              {badges ? <div className="mt-0.5 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 sm:pt-4">{actions}</div> : null}
        </div>
        {puces.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-2 border-t pt-4">
            {puces.map((p, i) => (
              <li key={i} className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-marque-bleu-50 px-3 py-1 text-xs font-medium text-marque-bleu-800 ring-1 ring-marque-bleu-100 dark:bg-marque-bleu-950/40 dark:text-marque-bleu-100 dark:ring-marque-bleu-800/50">
                <p.icone className="size-3.5 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0">{p.texte}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** Ruban de la bannière (anniversaire proche…) : pastille translucide lisible sur le dégradé. */
export function RubanHero({ icone: Icone, children }: { icone: Icone; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur-md">
      <Icone className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Cartes */

const TONS = {
  bleu: "bg-marque-bleu-100 text-marque-bleu-700 dark:bg-marque-bleu-800/50 dark:text-marque-bleu-100",
  orange: "bg-marque-orange-100 text-marque-orange-700 dark:bg-marque-orange-900/40 dark:text-marque-orange-200",
  vert: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  neutre: "bg-muted text-muted-foreground",
} as const;

export function CarteFiche({ icone: Icone, titre, aide, droite, ton = "bleu", confidentiel = false, className, children }: { icone: Icone; titre: string; aide?: string; droite?: ReactNode; ton?: keyof typeof TONS; confidentiel?: boolean; className?: string; children: ReactNode }) {
  return (
    <Card className={cn("animate-in fade-in slide-in-from-bottom-2 gap-0 p-0 duration-500 fill-mode-both", confidentiel && "ring-marque-orange/30", className)}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-3.5", confidentiel && "bg-marque-orange-50/70 dark:bg-marque-orange-900/10")}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TONS[confidentiel ? "orange" : ton])}>
            <Icone className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{titre}</h2>
            {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
          </div>
        </div>
        {droite ? <div className="max-w-full">{droite}</div> : null}
      </header>
      <div className="flex flex-col gap-3 px-5 py-4">{children}</div>
    </Card>
  );
}

/** Liste de lignes « icône · intitulé · valeur » à l'intérieur d'une carte. */
export function ListeInfos({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col divide-y divide-border/60 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">{children}</dl>;
}

export function LigneInfo({ icone: Icone, intitule, children, vide = false }: { icone: Icone; intitule: string; children: ReactNode; vide?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{intitule}</dt>
        <dd className={cn("text-sm break-words", vide ? "text-muted-foreground italic" : "font-medium")}>{children}</dd>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tuiles */

const TONS_TUILE = {
  neutre: "bg-muted/60 text-foreground",
  bleu: "bg-marque-bleu-50 text-marque-bleu-800 dark:bg-marque-bleu-800/40 dark:text-marque-bleu-50",
  alerte: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  succes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
} as const;

export function TuileChiffre({ valeur, libelle, ton = "neutre" }: { valeur: number | string; libelle: string; ton?: keyof typeof TONS_TUILE }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-xl px-4 py-3", TONS_TUILE[ton])}>
      <span className="text-2xl leading-none font-semibold tabular-nums">{valeur}</span>
      <span className="text-xs opacity-80">{libelle}</span>
    </div>
  );
}
