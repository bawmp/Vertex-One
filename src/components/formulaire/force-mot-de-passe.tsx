"use client";

import { Check } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/lib/i18n/contexte";

/** Estime la solidité d'un mot de passe de 0 (vide) à 4 : longueur, mélange de casse, chiffres, symboles. */
export function niveauMotDePasse(mdp: string): 0 | 1 | 2 | 3 | 4 {
  if (!mdp) return 0;
  let points = 0;
  if (mdp.length >= 8) points++;
  if (mdp.length >= 12) points++;
  if (/[a-z]/.test(mdp) && /[A-Z]/.test(mdp)) points++;
  if (/\d/.test(mdp)) points++;
  if (/[^A-Za-z0-9]/.test(mdp)) points++;
  if (mdp.length < 8) return 1;
  return Math.max(1, Math.min(4, points - 0)) as 1 | 2 | 3 | 4;
}

const COULEURS = ["bg-muted", "bg-destructive", "bg-marque-orange", "bg-marque-orange-400", "bg-emerald-500"];

/**
 * Jauge de solidité qui se remplit pendant la frappe, avec le critère minimal (8 caractères) en liste de contrôle.
 * Purement indicative : seule la règle serveur (8 caractères minimum) fait foi, jamais cette estimation.
 */
export function ForceMotDePasse({ valeur }: { valeur: string }) {
  const t = useT();
  const niveau = niveauMotDePasse(valeur);
  const libelles = ["", t("Trop court"), t("Moyen"), t("Bon"), t("Excellent")];
  const longueurOk = valeur.length >= 8;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-300", i <= niveau ? COULEURS[niveau] : "bg-muted")} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("inline-flex items-center gap-1.5 transition-colors", longueurOk ? "text-emerald-600" : "text-muted-foreground")}>
          <span className={cn("flex size-4 items-center justify-center rounded-full transition-colors", longueurOk ? "bg-emerald-500 text-white" : "bg-muted")}>{longueurOk ? <Check className="size-3" aria-hidden /> : null}</span>
          {t("8 caractères minimum")}
        </span>
        <span className="font-medium text-muted-foreground">{libelles[niveau]}</span>
      </div>
    </div>
  );
}
