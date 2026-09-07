"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { mettreEnPauseFactureRecurrente, reactiverFactureRecurrente, arreterFactureRecurrente } from "@/lib/actions/facture-recurrente";

export function BoutonsFactureRecurrente({ factureRecurrenteId, statut }: { factureRecurrenteId: string; statut: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      {statut === "ACTIF" ? (
        <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => startTransition(() => mettreEnPauseFactureRecurrente(factureRecurrenteId))}>
          {enCours ? <Spinner /> : null}
          Mettre en pause
        </Button>
      ) : null}
      {statut === "EN_PAUSE" ? (
        <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => startTransition(() => reactiverFactureRecurrente(factureRecurrenteId))}>
          {enCours ? <Spinner /> : null}
          Réactiver
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={enCours}
        onClick={() => startTransition(() => arreterFactureRecurrente(factureRecurrenteId))}
      >
        Arrêter
      </Button>
    </div>
  );
}
