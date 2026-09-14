"use client";

import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTraduction } from "@/lib/i18n/contexte";
import { traduireNav } from "@/lib/i18n/nav";
import { definirOrdreModules } from "@/lib/actions/preferences";

export function FormulaireOrdreModules({ libellesInitiaux }: { libellesInitiaux: string[] }) {
  const t = useTraduction();
  const [libelles, setLibelles] = useState(libellesInitiaux);
  const [enCours, startTransition] = useTransition();

  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= libelles.length) return;
    const nouveaux = [...libelles];
    [nouveaux[index], nouveaux[cible]] = [nouveaux[cible], nouveaux[index]];
    setLibelles(nouveaux);
    startTransition(() => definirOrdreModules(nouveaux));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t.monCompte.ordreModulesTitre}</p>
      <p className="text-xs text-muted-foreground">{t.monCompte.ordreModulesDescription}</p>
      <div className="mt-1 flex flex-col divide-y divide-border rounded-lg border border-border">
        {libelles.map((libelle, index) => (
          <div key={libelle} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{traduireNav(libelle, t)}</span>
            <div className="flex items-center gap-1">
              {enCours ? <Spinner className="size-3.5" /> : null}
              <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => deplacer(index, -1)} aria-label={t.monCompte.monter}>
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={index === libelles.length - 1} onClick={() => deplacer(index, 1)} aria-label={t.monCompte.descendre}>
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
