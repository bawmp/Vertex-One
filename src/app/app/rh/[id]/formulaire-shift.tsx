"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { assignerShift } from "@/lib/actions/shift";

export function FormulaireShift({ dossierRHId, shiftId, shifts }: { dossierRHId: string; shiftId: string | null; shifts: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState(assignerShift, null);

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="shiftId">Shift</Label>
        <Select id="shiftId" name="shiftId" defaultValue={shiftId ?? ""} className="w-56">
          <option value="">Aucun (pointage toujours présent)</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Assigner
      </Button>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
