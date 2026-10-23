"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { definirFiligraneDocuments } from "@/lib/actions/entreprise-branding";
import { useT } from "@/lib/i18n/contexte";

/**
 * Interrupteur « Logo en filigrane sur les documents PDF » : enregistré dès qu'on le change. Sans logo téléversé, il n'y a de toute
 * façon rien à afficher (le réglage est alors sans effet, et le texte le dit).
 */
export function FormulaireFiligrane({ actifInitial, aUnLogo }: { actifInitial: boolean; aUnLogo: boolean }) {
  const t = useT();
  const [actif, setActif] = useState(actifInitial);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    const avant = actif;
    setActif(valeur);
    setErreur(null);
    demarrer(async () => {
      const r = await definirFiligraneDocuments(valeur);
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
        {t("Afficher le logo en filigrane sur les devis, factures et autres documents PDF")}
        {enCours ? <Spinner className="size-3.5" /> : null}
      </label>
      {!aUnLogo ? <p className="text-xs text-muted-foreground">{t("Aucun logo téléversé : ce réglage n'a pas d'effet pour le moment.")}</p> : null}
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
