"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { changerSerieVendue, type EtatSeries } from "@/lib/actions/series";
import { useT } from "@/lib/i18n/contexte";

export type SerieFactureAffichee = { id: string; numero: string; produit: string; disponibles: { id: string; numero: string }[] };

/** Numéros de série vendus par la facture, imprimés sur le PDF ; on peut en changer un (numéro en stock du même produit) si le mauvais a été emporté. */
export function CarteSeries({ factureId, series, modifiable }: { factureId: string; series: SerieFactureAffichee[]; modifiable: boolean }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatSeries>(null);
  const [enCours, startTransition] = useTransition();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Hash className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 className="text-sm font-medium">{t("Numéros de série vendus")}</h2>
            <p className="text-sm text-muted-foreground">{t("Ils figurent sur la facture. Si le mauvais numéro a été emporté, changez-le : l'ancien revient en stock.")}</p>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-border rounded-lg border">
          {series.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium tabular-nums">{s.numero}</p>
                <p className="text-xs text-muted-foreground">{s.produit}</p>
              </div>
              {modifiable && s.disponibles.length > 0 ? (
                <select
                  aria-label={t("Changer le numéro {numero}", { numero: s.numero })}
                  defaultValue=""
                  disabled={enCours}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  onChange={(e) => {
                    const nouveau = e.target.value;
                    if (!nouveau) return;
                    setEtat(null);
                    startTransition(async () => setEtat(await changerSerieVendue(factureId, s.id, nouveau)));
                  }}
                >
                  <option value="">{t("Changer le numéro…")}</option>
                  {s.disponibles.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.numero}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ))}
        </div>
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CircleCheck className="size-4" aria-hidden />
            {etat.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
