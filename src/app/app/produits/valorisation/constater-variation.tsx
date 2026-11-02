"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Champ } from "@/components/formulaire/champ";
import { enregistrerVariationStock, type EtatValorisation } from "@/lib/actions/valorisation-stock";
import { useT } from "@/lib/i18n/contexte";

/** Un seul geste : choisir la date de l'inventaire (aujourd'hui par défaut) et constater la variation dans la comptabilité. */
export function ConstaterVariation({ dateParDefaut, montantAttendu }: { dateParDefaut: string; montantAttendu: string }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatValorisation>(null);
  const [enCours, startTransition] = useTransition();

  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    setEtat(null);
    startTransition(async () => setEtat(await enregistrerVariationStock(null, donnees)));
  }

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-3" aria-label={t("Constater la variation de stock")}>
      <div className="flex flex-wrap items-start gap-3">
        <Champ label={t("Date de l'inventaire")} name="date" type="date" defaultValue={dateParDefaut} max={dateParDefaut} required className="w-56" />
        <Button type="submit" disabled={enCours} className="mt-1">
          {enCours ? <Spinner /> : null}
          {t("Constater la variation de {montant}", { montant: montantAttendu })}
        </Button>
      </div>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}
    </form>
  );
}
