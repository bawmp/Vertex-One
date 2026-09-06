"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { marquerFactureFournisseurPayee } from "@/lib/actions/facture-fournisseur";

export function BoutonMarquerPayee({ factureFournisseurId }: { factureFournisseurId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={enCours}
      onClick={() => startTransition(() => marquerFactureFournisseurPayee(factureFournisseurId))}
    >
      {enCours ? <Spinner /> : null}
      Marquer payée
    </Button>
  );
}
