"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { definirPaiementEnTranches } from "@/lib/actions/entreprise-branding";
import { useT } from "@/lib/i18n/contexte";

/** Interrupteur « Paiement en plusieurs fois » : enregistré dès qu'on le change. */
export function FormulairePaiementTranches({ actifInitial }: { actifInitial: boolean }) {
  const t = useT();
  const [actif, setActif] = useState(actifInitial);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(valeur: boolean) {
    const avant = actif;
    setActif(valeur);
    setErreur(null);
    demarrer(async () => {
      const r = await definirPaiementEnTranches(valeur);
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
        {t("Permettre à vos clients de payer leurs factures en plusieurs fois")}
        {enCours ? <Spinner className="size-3.5" /> : null}
      </label>
      <p className="text-xs text-muted-foreground">{t("Le client choisit le montant de chaque tranche, d'au moins 1 000 FCFA, jusqu'au solde de sa facture. Désactivé, il règle la facture en une fois.")}</p>
      {erreur ? <p role="alert" className="text-xs text-destructive">{erreur}</p> : null}
    </div>
  );
}
