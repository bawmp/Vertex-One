"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { definirManagersVoientTout } from "@/lib/actions/entreprise-branding";
import { useT } from "@/lib/i18n/contexte";

/** Interrupteur « Les managers voient toute l'entreprise » : enregistré dès qu'on le change. */
export function FormulaireManagersVoientTout({ actifInitial }: { actifInitial: boolean }) {
  const t = useT();
  const [actif, setActif] = useState(actifInitial);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    const avant = actif;
    setActif(valeur);
    setErreur(null);
    demarrer(async () => {
      const r = await definirManagersVoientTout(valeur);
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
        {t("Les managers voient toute l'entreprise")}
        {enCours ? <Spinner className="size-3.5" /> : null}
      </label>
      <p className="text-xs text-muted-foreground">
        {t("Activé, vos managers voient les contacts, devis, factures, projets, dossiers, documents, contrats, achats, réservations et tickets de toute l'entreprise, et non plus seulement ceux de leur équipe. Leurs droits ne changent pas (ni suppression, ni comptabilité, ni paramètres), et la RH, le recrutement et la messagerie gardent leurs règles.")}
      </p>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
