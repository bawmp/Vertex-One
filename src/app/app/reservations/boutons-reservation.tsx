"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { annulerReservation, marquerAbsence, marquerTerminee } from "@/lib/actions/reservations";

export function BoutonsReservation({ reservationId, statut }: { reservationId: string; statut: string }) {
  const [enCours, startTransition] = useTransition();
  const [motif, setMotif] = useState("");
  const [annulationOuverte, setAnnulationOuverte] = useState(false);

  if (statut !== "CONFIRMEE") return null;

  if (annulationOuverte) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(() => annulerReservation(reservationId, motif));
        }}
      >
        <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (optionnel)" className="h-7 w-36 text-xs" />
        <Button type="submit" size="xs" variant="ghost" disabled={enCours} className="text-destructive">
          {enCours ? <Spinner className="size-3.5" /> : null}
          Confirmer
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setAnnulationOuverte(false)}>
          Retour
        </Button>
      </form>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button type="button" size="xs" variant="outline" disabled={enCours} onClick={() => startTransition(() => marquerTerminee(reservationId))}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Terminé
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={enCours} onClick={() => startTransition(() => marquerAbsence(reservationId))}>
        Absence
      </Button>
      <Button type="button" size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={enCours} onClick={() => setAnnulationOuverte(true)}>
        Annuler
      </Button>
    </div>
  );
}
