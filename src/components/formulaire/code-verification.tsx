"use client";

import { useId, useRef } from "react";
import { cn } from "cn";

/**
 * Saisie d'un code à usage unique (ex. 6 chiffres reçus par email) : une case par chiffre, passage automatique à la
 * suivante, retour arrière qui recule, collage du code entier. Le formulaire reçoit UNE seule valeur (`nom`), comme
 * avec un champ ordinaire — les cases ne sont que l'habillage.
 */
export function CodeVerification({ nom, longueur = 6, etiquette, valeur, onChange }: { nom: string; longueur?: number; etiquette: string; valeur: string; onChange: (valeur: string) => void }) {
  const idGroupe = useId();
  const cases = useRef<(HTMLInputElement | null)[]>([]);
  const chiffres = valeur.replace(/\D/g, "").slice(0, longueur).padEnd(longueur, " ").split("");

  function modifier(index: number, brut: string) {
    const saisis = brut.replace(/\D/g, "");
    if (!saisis) {
      const copie = [...chiffres];
      copie[index] = " ";
      onChange(copie.join("").trimEnd());
      return;
    }
    // Plusieurs chiffres d'un coup (collage ou saisie assistée) : ils remplissent à partir de la case courante.
    const copie = [...chiffres];
    saisis.split("").forEach((c, i) => {
      if (index + i < longueur) copie[index + i] = c;
    });
    onChange(copie.join("").trimEnd());
    cases.current[Math.min(index + saisis.length, longueur - 1)]?.focus();
  }

  function touche(index: number, evenement: React.KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === "Backspace" && !chiffres[index].trim() && index > 0) cases.current[index - 1]?.focus();
    if (evenement.key === "ArrowLeft" && index > 0) cases.current[index - 1]?.focus();
    if (evenement.key === "ArrowRight" && index < longueur - 1) cases.current[index + 1]?.focus();
  }

  return (
    <div role="group" aria-labelledby={`${idGroupe}-etiquette`} className="flex flex-col gap-2">
      <span id={`${idGroupe}-etiquette`} className="text-sm font-medium">
        {etiquette}
      </span>
      <input type="hidden" name={nom} value={valeur.replace(/\D/g, "")} />
      <div className="flex gap-2">
        {chiffres.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              cases.current[i] = el;
            }}
            value={c.trim()}
            onChange={(e) => modifier(i, e.target.value)}
            onKeyDown={(e) => touche(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`${etiquette} ${i + 1}`}
            className={cn(
              "h-14 w-full min-w-0 rounded-xl border bg-background text-center text-2xl font-semibold tabular-nums shadow-xs outline-none transition-all duration-150",
              "hover:border-primary/40 focus:scale-105 focus:border-primary focus:ring-4 focus:ring-primary/15",
              c.trim() ? "border-primary/60 bg-primary/5" : "border-input"
            )}
          />
        ))}
      </div>
    </div>
  );
}
