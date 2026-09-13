"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { desactiverServiceReservable } from "@/lib/actions/reservations";

export function BoutonDesactiverService({ serviceId }: { serviceId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (confirm("Désactiver ce service ? Il ne sera plus proposé sur la page publique.")) {
          startTransition(() => desactiverServiceReservable(serviceId));
        }
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      Désactiver
    </Button>
  );
}
