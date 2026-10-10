"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Lock, ShieldCheck, Smartphone, X } from "lucide-react";
import { cn } from "cn";

/** Compte les secondes écoulées depuis le montage : rassure pendant l'attente d'une validation sur téléphone. */
function useSecondesEcoulees(): number {
  const [secondes, setSecondes] = useState(0);
  useEffect(() => {
    const minuteur = setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => clearInterval(minuteur);
  }, []);
  return secondes;
}

function formaterDuree(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
}

/**
 * Attente de validation d'un paiement : un téléphone entouré d'ondes qui se propagent, une liste d'étapes dont la
 * courante pulse, une barre de progression sans fin et le temps écoulé. Rien n'est figé : le client voit que ça travaille.
 */
export function EcranAttentePaiement({ titre, texte, etapes, etapeActive = 1, libelleTemps, children }: { titre: string; texte: string; etapes: string[]; etapeActive?: number; libelleTemps: string; children?: ReactNode }) {
  const secondes = useSecondesEcoulees();
  return (
    <div role="status" aria-live="polite" className="flex animate-in flex-col items-center gap-5 text-center duration-500 fade-in zoom-in-95">
      <div className="relative flex size-28 items-center justify-center">
        {[0, 0.85, 1.7].map((delai) => (
          <span key={delai} aria-hidden className="animate-onde-paiement absolute inset-2 rounded-full border-2 border-marque-orange" style={{ animationDelay: `${delai}s` }} />
        ))}
        <span className="relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Smartphone className="size-9" aria-hidden />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{titre}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{texte}</p>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-2 text-left">
        {etapes.map((libelle, i) => {
          const faite = i < etapeActive;
          const courante = i === etapeActive;
          return (
            <li key={libelle} style={{ animationDelay: `${i * 120}ms` }} className={cn("animate-apparition-etape flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors", courante ? "border-marque-orange/50 bg-marque-orange-50 font-medium" : faite ? "border-transparent bg-muted/60" : "border-transparent text-muted-foreground/70")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", faite ? "bg-emerald-500 text-white" : courante ? "bg-marque-orange text-white" : "bg-muted text-muted-foreground")}>
                {faite ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              {libelle}
              {courante ? <span aria-hidden className="ml-auto size-2 animate-pulse rounded-full bg-marque-orange" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="flex w-full max-w-sm flex-col gap-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="animate-progression-indeterminee h-full w-2/5 rounded-full bg-gradient-to-r from-primary to-marque-orange" />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {libelleTemps} {formaterDuree(secondes)}
        </p>
      </div>
      {children}
    </div>
  );
}

/** Paiement réussi : un cercle et une coche qui se dessinent, quelques confettis aux couleurs de la marque. */
export function EcranPaiementReussi({ titre, texte, children }: { titre: string; texte?: string; children?: ReactNode }) {
  const confettis = ["bg-marque-orange", "bg-primary", "bg-emerald-500", "bg-marque-orange-300", "bg-marque-bleu-300"];
  return (
    <div role="status" aria-live="polite" className="relative flex flex-col items-center gap-4 overflow-hidden py-2 text-center">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} aria-hidden className={cn("animate-confetti absolute top-4 size-2 rounded-sm", confettis[i % confettis.length])} style={{ left: `${6 + ((i * 7) % 88)}%`, animationDelay: `${0.5 + (i % 5) * 0.08}s` }} />
      ))}
      <span className="relative flex size-24 animate-in items-center justify-center rounded-full bg-emerald-500/10 duration-500 zoom-in-50">
        <svg viewBox="0 0 52 52" className="size-20 text-emerald-600" fill="none" aria-hidden>
          <circle className="animate-trace-cercle" cx="26" cy="26" r="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 26 26)" />
          <path className="animate-trace-coche" d="M15 27l7 7 15-16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex animate-in flex-col gap-1 delay-500 duration-500 fade-in slide-in-from-bottom-2 fill-mode-both">
        <h2 className="text-xl font-semibold tracking-tight">{titre}</h2>
        {texte ? <p className="max-w-sm text-sm text-muted-foreground">{texte}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Paiement échoué : la croix secoue brièvement, le texte reste doux (rien n'a été débité sans confirmation). */
export function EcranPaiementEchoue({ titre, texte, children }: { titre: string; texte?: string; children?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-2 text-center">
      <span className="animate-secousse flex size-20 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <X className="size-10" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{titre}</h2>
        {texte ? <p className="max-w-sm text-sm text-muted-foreground">{texte}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Bandeau de réassurance : cadenas, moyens acceptés, qui traite le paiement. */
export function BandeauPaiementSecurise({ libelle, moyens }: { libelle: string; moyens: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <Lock className="size-3.5 text-emerald-600" aria-hidden />
        {libelle}
      </span>
      {moyens.map((m) => (
        <span key={m} className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3.5" aria-hidden />
          {m}
        </span>
      ))}
    </div>
  );
}

/** Montant à régler, en grand, dans une carte légèrement teintée. */
export function RecapMontant({ etiquette, montant, designation }: { etiquette: string; montant: string; designation?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 rounded-2xl border border-marque-bleu-100 bg-gradient-to-br from-marque-bleu-50 to-background p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{etiquette}</p>
        {designation ? <p className="truncate text-sm text-foreground">{designation}</p> : null}
      </div>
      <p className="text-2xl font-bold tracking-tight text-primary tabular-nums">{montant}</p>
    </div>
  );
}
