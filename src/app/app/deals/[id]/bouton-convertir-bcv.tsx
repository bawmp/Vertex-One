"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { convertirBonCommandeVenteEnFacture, annulerBonCommandeVente } from "@/lib/actions/bon-commande-vente";

export function BoutonConvertirBCV({ bonCommandeVenteId }: { bonCommandeVenteId: string }) {
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => startTransition(() => convertirBonCommandeVenteEnFacture(bonCommandeVenteId))}>
        {enCours ? <Spinner /> : null}
        Convertir en facture
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={enCours}
        onClick={() => startTransition(() => annulerBonCommandeVente(bonCommandeVenteId))}
      >
        Annuler
      </Button>
    </div>
  );
}
