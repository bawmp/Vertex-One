"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { convertirBonCommandeVenteEnFacture, annulerBonCommandeVente } from "@/lib/actions/bon-commande-vente";
import { useT } from "@/lib/i18n/contexte";


export function BoutonConvertirBCV({ bonCommandeVenteId }: { bonCommandeVenteId: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => startTransition(() => convertirBonCommandeVenteEnFacture(bonCommandeVenteId))}>
        {enCours ? <Spinner /> : null}
        {t("Convertir en facture")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={enCours}
        onClick={() => startTransition(() => annulerBonCommandeVente(bonCommandeVenteId))}
      >
        {t("Annuler")}
      </Button>
    </div>
  );
}
