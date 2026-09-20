"use client";

import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTraduction } from "@/lib/i18n/contexte";
import { traduireNav, traduireGroupe, regrouperParRubrique } from "@/lib/i18n/nav";
import { definirOrdreModules } from "@/lib/actions/preferences";

export function FormulaireOrdreModules({ libellesInitiaux }: { libellesInitiaux: string[] }) {
  const t = useTraduction();
  const [libelles, setLibelles] = useState(libellesInitiaux);
  const [enCours, startTransition] = useTransition();

  // La barre latérale range les modules par catégorie en conservant leur ordre
  // relatif : on ne réordonne donc qu'à l'intérieur d'une catégorie (échanger
  // deux modules de catégories différentes n'aurait aucun effet visible).
  function deplacer(libelle: string, voisin: string) {
    const nouveaux = [...libelles];
    const i = nouveaux.indexOf(libelle);
    const j = nouveaux.indexOf(voisin);
    [nouveaux[i], nouveaux[j]] = [nouveaux[j], nouveaux[i]];
    setLibelles(nouveaux);
    startTransition(() => definirOrdreModules(nouveaux));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t.monCompte.ordreModulesTitre}</p>
      <p className="text-xs text-muted-foreground">{t.monCompte.ordreModulesDescription}</p>
      {regrouperParRubrique(libelles, (l) => l).map(({ cle, elements }) => (
        <div key={cle} className="mt-1 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{traduireGroupe(cle, t)}</p>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {elements.map((libelle, index) => (
              <div key={libelle} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{traduireNav(libelle, t)}</span>
                <div className="flex items-center gap-1">
                  {enCours ? <Spinner className="size-3.5" /> : null}
                  <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => deplacer(libelle, elements[index - 1])} aria-label={t.monCompte.monter}>
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={index === elements.length - 1} onClick={() => deplacer(libelle, elements[index + 1])} aria-label={t.monCompte.descendre}>
                    <ArrowDown className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
