"use client";

import { useState, useTransition } from "react";
import { ouvrirFichesAction } from "@/lib/actions/fiche-ouverte";
import { useT } from "@/lib/i18n/contexte";

/** Interrupteur « ouvrir mes fiches à cette entreprise du groupe » (Administrateur seulement). */
export function ReglageOuverture({ partenaireId, nom, actif }: { partenaireId: string; nom: string; actif: boolean }) {
  const t = useT();
  const [valeur, setValeur] = useState(actif);
  const [erreur, setErreur] = useState<string | null>(null);
  const [attente, demarrer] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input
            type="checkbox"
            role="switch"
            checked={valeur}
            disabled={attente}
            aria-label={t("Ouvrir mes fiches à {nom}", { nom })}
            onChange={(e) => {
              const suivant = e.target.checked;
              setValeur(suivant);
              setErreur(null);
              demarrer(async () => {
                const r = await ouvrirFichesAction(partenaireId, suivant);
                if (r.erreur) {
                  setValeur(!suivant);
                  setErreur(r.erreur);
                }
              });
            }}
            className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
          />
          <span aria-hidden className="h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
          <span aria-hidden className="absolute left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
        <span className="min-w-0">{valeur ? t("Fiches ouvertes à {nom}", { nom }) : t("Fiches fermées à {nom}", { nom })}</span>
      </label>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
