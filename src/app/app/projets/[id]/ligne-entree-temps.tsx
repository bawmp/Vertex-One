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
}) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
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
