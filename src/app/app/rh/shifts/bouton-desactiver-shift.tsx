"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { desactiverShift } from "@/lib/actions/shift";

export function BoutonDesactiverShift({ shiftId }: { shiftId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (confirm("Désactiver ce shift ? Il ne sera plus assignable, mais les employés qui l'ont déjà gardent leur assignation.")) {
          startTransition(() => desactiverShift(shiftId));
        }
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      Désactiver
    </Button>
  );
}
