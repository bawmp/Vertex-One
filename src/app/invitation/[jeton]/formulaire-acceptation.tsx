"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accepterInvitation } from "@/lib/actions/invitation";

export function FormulaireAcceptation({ jeton }: { jeton: string }) {
  const [etat, action, enCours] = useActionState(accepterInvitation, null);

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="jeton" value={jeton} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="nomComplet">Votre nom complet</Label>
        <Input id="nomComplet" name="nomComplet" required minLength={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="motDePasse">Choisir un mot de passe</Label>
        <Input id="motDePasse" name="motDePasse" type="password" required minLength={8} />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? "Activation…" : "Activer mon compte"}
      </Button>
    </form>
  );
}
