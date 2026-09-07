"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { annulerFactureFournisseur } from "@/lib/actions/facture-fournisseur";

export function BoutonAnnulerFacture({ factureFournisseurId }: { factureFournisseurId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      disabled={enCours}
      onClick={() => {
        const motif = window.prompt("Motif de l'annulation (avoir fournisseur) :");
        if (motif === null) return;
        startTransition(() => annulerFactureFournisseur(factureFournisseurId, motif));
      }}
    >
      {enCours ? <Spinner /> : null}
      Annuler (avoir)
    </Button>
  );
}
