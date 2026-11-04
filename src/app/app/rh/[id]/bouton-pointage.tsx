"use client";

import { useTransition } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { pointerArriveeAction, pointerDepartAction } from "@/lib/actions/rh";
import { useT } from "@/lib/i18n/contexte";

export function BoutonPointage({ arrive, parti }: { arrive: boolean; parti: boolean }) {
  const t = useT();
  const [enCours, demarrer] = useTransition();

  if (parti) {
    return <p className="text-sm text-muted-foreground">{t("Pointage terminé pour aujourd'hui.")}</p>;
  }

  if (arrive) {
    return (
      <Button size="sm" variant="outline" disabled={enCours} onClick={() => demarrer(() => pointerDepartAction())}>
        {enCours ? <Spinner /> : <LogOut data-icon="inline-start" aria-hidden />}
        {t("Je pars")}
      </Button>
    );
  }

  return (
    <Button size="sm" disabled={enCours} onClick={() => demarrer(() => pointerArriveeAction())}>
      {enCours ? <Spinner /> : <LogIn data-icon="inline-start" aria-hidden />}
      {t("Je suis arrivé(e)")}
    </Button>
  );
}
