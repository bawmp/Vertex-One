"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { desactiverPolitiqueConge } from "@/lib/actions/politique-conge";
import { useT } from "@/lib/i18n/contexte";

export function BoutonDesactiverPolitique({ politiqueCongeId }: { politiqueCongeId: string }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={enCours}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (confirm(t("Désactiver cette politique ? Elle ne sera plus assignable, mais les employés qui l'ont déjà gardent leur historique."))) {
          startTransition(() => desactiverPolitiqueConge(politiqueCongeId));
        }
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : null}
      {t("Désactiver")}
    </Button>
  );
}
