"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ajouterPalierAnciennete } from "@/lib/actions/politique-conge";

export function FormulairePalier({ politiqueCongeId }: { politiqueCongeId: string }) {
  const [etat, action, enCours] = useActionState(ajouterPalierAnciennete, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="ghost" size="xs" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Ajouter un palier
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="politiqueCongeId" value={politiqueCongeId} />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`anneesAncienneteMin-${politiqueCongeId}`}>À partir de (années)</Label>
          <Input id={`anneesAncienneteMin-${politiqueCongeId}`} name="anneesAncienneteMin" type="number" min={0} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`joursSupplementaires-${politiqueCongeId}`}>Jours supplémentaires</Label>
          <Input id={`joursSupplementaires-${politiqueCongeId}`} name="joursSupplementaires" type="number" min={1} required />
        </div>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="xs" disabled={enCours}>
          {enCours ? <Spinner className="size-3.5" /> : null}
          {enCours ? "Ajout…" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
