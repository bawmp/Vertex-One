"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { annulerRecuVente } from "@/lib/actions/recu-vente";
import { useT } from "@/lib/i18n/contexte";

export function BoutonAnnulerRecuVente({ recuVenteId }: { recuVenteId: string }) {
  const t = useT();
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
      {t("Annuler")}
    </Button>
  );
}
