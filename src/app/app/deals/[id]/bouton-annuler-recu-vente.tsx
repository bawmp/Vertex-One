"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { annulerRecuVente } from "@/lib/actions/recu-vente";

export function BoutonAnnulerRecuVente({ recuVenteId }: { recuVenteId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      disabled={enCours}
      onClick={() => startTransition(() => annulerRecuVente(recuVenteId))}
    >
      {enCours ? <Spinner /> : null}
      Annuler
    </Button>
  );
}
