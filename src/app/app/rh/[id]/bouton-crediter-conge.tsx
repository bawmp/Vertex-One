"use client";

import { useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { crediterSoldeSelonPolitique } from "@/lib/actions/politique-conge";
import { useT } from "@/lib/i18n/contexte";

export function BoutonCrediterConge({ dossierRHId, droitAnnuel }: { dossierRHId: string; droitAnnuel: number }) {
  const t = useT();
  const [enCours, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={enCours}
      onClick={() => {
        if (confirm(t("Créditer {n} jour(s) au solde actuel ? Le solde existant n'est jamais écrasé, seulement augmenté.", { n: droitAnnuel }))) {
          startTransition(() => crediterSoldeSelonPolitique(dossierRHId));
        }
      }}
    >
      {enCours ? <Spinner className="size-3.5" /> : <CalendarPlus data-icon="inline-start" aria-hidden />}
      {t("Créditer {n} j.", { n: droitAnnuel })}
    </Button>
  );
}
