"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { reviserSalaire } from "@/lib/actions/revision-salaire";

export function FormulaireRevisionSalaire({ dossierRHId, salaireActuel }: { dossierRHId: string; salaireActuel: number | null }) {
  const [etat, action, enCours] = useActionState(reviserSalaire, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        Réviser le salaire
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nouveauSalaire">Nouveau salaire (FCFA)</Label>
          <Input id="nouveauSalaire" name="nouveauSalaire" type="number" min={1} defaultValue={salaireActuel ?? ""} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="motif">Motif (optionnel)</Label>
          <Input id="motif" name="motif" placeholder="ex : Augmentation annuelle" />
        </div>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
