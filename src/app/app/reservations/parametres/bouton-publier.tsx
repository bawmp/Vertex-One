"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { publierReservations } from "@/lib/actions/reservations";

export function BoutonPublier({ publie }: { publie: boolean }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button type="button" variant={publie ? "outline" : "default"} size="sm" disabled={enCours} className="self-start" onClick={() => startTransition(() => publierReservations(!publie))}>
      {enCours ? <Spinner className="size-3.5" /> : null}
      {publie ? "Dépublier" : "Publier la page"}
    </Button>
  );
}
