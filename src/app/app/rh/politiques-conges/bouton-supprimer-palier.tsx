"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { supprimerPalier } from "@/lib/actions/politique-conge";
import { useT } from "@/lib/i18n/contexte";

export function BoutonSupprimerPalier({ palierId }: { palierId: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      aria-label={t("Supprimer ce palier")}
      onClick={() => startTransition(() => supprimerPalier(palierId))}
    >
      {enCours ? <Spinner className="size-3" /> : <Trash2 className="size-3.5" aria-hidden />}
    </Button>
  );
}
