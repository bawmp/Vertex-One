"use client";

import type { CSSProperties } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export type OptionCarte = {
  valeur: string;
  libelle: string;
  detail?: string;
  icone?: LucideIcon;
  /** Couleur d'une marque tierce (ex. un opérateur) : jamais une couleur de la charte Vertex One. */
  pastille?: string;
};

/**
 * Choix unique en grandes cartes tactiles, à la place de boutons radio ou de listes déroulantes. La carte choisie
 * s'entoure aux couleurs de la marque et reçoit une coche qui apparaît en douceur. Accessible : groupe `radiogroup`,
 * cartes `radio`, navigation aux flèches. `nom` ajoute un champ caché pour qu'un <form> (Server Action) reçoive la valeur.
 */
export function ChoixCartes({
  nom,
  etiquette,
  valeur,
  onChange,
  options,
  colonnes = 2,
  desactive,
}: {
  nom?: string;
  /** Libellé lu par les lecteurs d'écran pour le groupe. */
  etiquette: string;
  valeur: string;
  onChange: (valeur: string) => void;
  options: OptionCarte[];
  colonnes?: 1 | 2 | 3;
  desactive?: boolean;
}) {
  function auClavier(evenement: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(evenement.key)) return;
    evenement.preventDefault();
    const index = options.findIndex((o) => o.valeur === valeur);
    const pas = evenement.key === "ArrowRight" || evenement.key === "ArrowDown" ? 1 : -1;
    const suivante = options[(index + pas + options.length) % options.length];
    onChange(suivante.valeur);
  }

  return (
    <div role="radiogroup" aria-label={etiquette} onKeyDown={auClavier} className={cn("grid grid-cols-1 gap-3", colonnes === 2 && "sm:grid-cols-2", colonnes === 3 && "sm:grid-cols-3")}>
      {nom ? <input type="hidden" name={nom} value={valeur} /> : null}
      {options.map((o) => {
        const choisi = o.valeur === valeur;
        const Icone = o.icone;
        return (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={choisi}
            tabIndex={choisi || (!valeur && o === options[0]) ? 0 : -1}
            disabled={desactive}
            onClick={() => onChange(o.valeur)}
            className={cn(
              "group relative flex items-center gap-3 rounded-2xl border bg-background p-4 text-left shadow-xs transition-all duration-200 outline-none",
              "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-4 focus-visible:ring-primary/20 active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
              choisi ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"
            )}
          >
            {o.pastille ? (
              <span className="size-10 shrink-0 rounded-xl shadow-inner ring-1 ring-black/5" style={{ backgroundColor: o.pastille } as CSSProperties} aria-hidden />
            ) : Icone ? (
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors", choisi ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary")}>
                <Icone className="size-5" aria-hidden />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-foreground">{o.libelle}</span>
              {o.detail ? <span className="text-xs text-muted-foreground">{o.detail}</span> : null}
            </span>
            <span aria-hidden className={cn("ml-auto flex size-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200", choisi ? "scale-100 border-primary bg-primary text-primary-foreground" : "scale-90 border-border bg-background text-transparent")}>
              <Check className="size-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
