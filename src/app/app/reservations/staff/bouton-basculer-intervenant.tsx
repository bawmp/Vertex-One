"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { definirIntervenant } from "@/lib/actions/reservations";

export function BoutonBasculerIntervenant({ utilisateurId, actif }: { utilisateurId: string; actif: boolean }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={actif ? "outline" : "ghost"}
      size="xs"
      disabled={enCours}
      onClick={() => startTransition(() => definirIntervenant(utilisateurId, !actif))}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      {actif ? "Réservable" : "Rendre réservable"}
    </Button>
  );
}
