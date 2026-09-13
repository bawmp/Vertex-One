"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { definirCouleurMarque, reinitialiserCouleurMarque } from "@/lib/actions/entreprise-branding";

export function FormulaireCouleur({ couleurMarque }: { couleurMarque: string | null }) {
  const [etat, action, enCours] = useActionState(definirCouleurMarque, null);
  const [reinitEnCours, startReinit] = useTransition();

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="color" name="couleurMarque" defaultValue={couleurMarque ?? "#047857"} className="h-9 w-14 cursor-pointer rounded-md border border-input p-1" />
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Appliquer
      </Button>
      {couleurMarque ? (
        <Button type="button" variant="ghost" size="sm" disabled={reinitEnCours} onClick={() => startReinit(() => reinitialiserCouleurMarque())}>
          Réinitialiser
        </Button>
      ) : null}
      {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
