"use client";

import { useTransition } from "react";
import { Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { supprimerEntreeTemps } from "@/lib/actions/entree-temps";
import { useT } from "@/lib/i18n/contexte";

export function LigneEntreeTemps({
  id,
  date,
  dureeHeures,
  tauxHoraire,
  facturable,
  facturee,
  note,
  tacheTitre,
  peutModifier,
  index = 0,
}: {
  id: string;
  date: Date;
  dureeHeures: number;
  tauxHoraire: number;
  facturable: boolean;
  facturee: boolean;
  note: string | null;
  tacheTitre: string | null;
  peutModifier: boolean;
  index?: number;
}) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <div
      className="group/ligne relative flex animate-in fade-in items-center gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
      />
      <div className="flex min-w-0 flex-1 items-center gap-3 transition-transform duration-150 group-hover/ligne:translate-x-1">
        <Clock className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {note || tacheTitre || t("Heures travaillées")}
            {tacheTitre && note ? <span className="text-muted-foreground"> — {tacheTitre}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(date)} — {dureeHeures}h
            {facturable ? ` × ${new Intl.NumberFormat(t.locale).format(tauxHoraire)} FCFA` : t(" (non facturable)")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {facturee ? (
          <Badge variant="success">{t("Facturée")}</Badge>
        ) : facturable ? (
          <Badge variant="warning">{t("À facturer")}</Badge>
        ) : null}
        {peutModifier && !facturee ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={enCours}
            onClick={() => startTransition(() => supprimerEntreeTemps(id))}
            aria-label={t("Supprimer cette entrée")}
            className="text-muted-foreground hover:text-destructive"
          >
            {enCours ? <Spinner className="size-3.5" /> : <Trash2 className="size-4" aria-hidden />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
