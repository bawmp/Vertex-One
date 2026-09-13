"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { desactiverPosteOuvert } from "@/lib/actions/recrutement";

export function BoutonDesactiverPoste({ posteId }: { posteId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (confirm("Désactiver ce poste ? Il ne sera plus affiché sur la page publique.")) {
          startTransition(() => desactiverPosteOuvert(posteId));
        }
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      Désactiver
    </Button>
  );
}
