"use client";

import { useTransition } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { pointerArriveeAction, pointerDepartAction } from "@/lib/actions/rh";

export function BoutonPointage({ arrive, parti }: { arrive: boolean; parti: boolean }) {
  const [enCours, demarrer] = useTransition();

  if (parti) {
    return <p className="text-sm text-muted-foreground">Pointage terminé pour aujourd&apos;hui.</p>;
  }

  if (arrive) {
    return (
      <Button size="sm" variant="outline" disabled={enCours} onClick={() => demarrer(() => pointerDepartAction())}>
        {enCours ? <Spinner /> : <LogOut data-icon="inline-start" aria-hidden />}
        Je pars
      </Button>
    );
  }

  return (
    <Button size="sm" disabled={enCours} onClick={() => demarrer(() => pointerArriveeAction())}>
      {enCours ? <Spinner /> : <LogIn data-icon="inline-start" aria-hidden />}
      Je suis arrivé(e)
    </Button>
  );
}
