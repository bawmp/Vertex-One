"use client";

import { useState, useTransition } from "react";
import { Boxes, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { changerGestionStock, type EtatGestionStock } from "@/lib/actions/gestion-stock";
import { useT } from "@/lib/i18n/contexte";

/** Interrupteur « Mon entreprise vend des produits » : active ou désactive tout le stock (suivi, inventaire, dépôts, valeur, alertes). */
export function CarteGestionStock({ active }: { active: boolean }) {
  const t = useT();
  const [etat, setEtat] = useState<EtatGestionStock>(null);
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Boxes className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {t("Mon entreprise vend des produits")}
            <Badge variant={active ? "success" : "neutral"}>{active ? t("Stock activé") : t("Stock désactivé")}</Badge>
          </p>
          <p className="text-muted-foreground">
            {t("Activez-le pour suivre le stock de vos produits : historique, inventaire, plusieurs dépôts, valeur du stock et alertes de stock bas. Une entreprise de services n'en a pas besoin.")}
          </p>
        </div>
      </div>
      {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4" aria-hidden />
          {etat.message}
        </p>
      ) : null}
      <Button
        type="button"
        variant={active ? "outline" : "default"}
        disabled={enCours}
        className="self-start"
        onClick={() => {
          setEtat(null);
          startTransition(async () => setEtat(await changerGestionStock(!active)));
        }}
      >
        {enCours ? <Spinner /> : null}
        {active ? t("Désactiver la gestion de stock") : t("Activer la gestion de stock")}
      </Button>
    </div>
  );
}
