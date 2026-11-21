"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { definirRevisionDevis } from "@/lib/actions/entreprise-branding";
import { useT } from "@/lib/i18n/contexte";

/** Interrupteur « Demande de révision d'un devis par le client » : enregistré dès qu'on le change. */
export function FormulaireRevisionDevis({ actifInitial }: { actifInitial: boolean }) {
  const t = useT();
  const [actif, setActif] = useState(actifInitial);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    const avant = actif;
    setActif(valeur);
    setErreur(null);
    demarrer(async () => {
      const r = await definirRevisionDevis(valeur);
      if (r?.erreur) {
        setActif(avant);
        setErreur(r.erreur);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" checked={actif} disabled={enCours} onChange={(e) => changer(e.target.checked)} className="size-4 accent-primary" />
        {t("Permettre à vos clients de demander la révision d'un devis")}
        {enCours ? <Spinner className="size-3.5" /> : null}
      </label>
      <p className="text-xs text-muted-foreground">{t("Depuis son lien, le client avance au moins 3 arguments et peut faire une contre-proposition ; vous êtes prévenu par email. Désactivé, il peut seulement accepter ou refuser le devis.")}</p>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
