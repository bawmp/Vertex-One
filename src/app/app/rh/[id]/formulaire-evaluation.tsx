"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerEvaluation } from "@/lib/actions/rh";

export function FormulaireEvaluation({ dossierRHId }: { dossierRHId: string }) {
  const [etat, action, enCours] = useActionState(creerEvaluation, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle évaluation
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="periode">Période</Label>
        <Input id="periode" name="periode" placeholder="ex : 2026-S1" required className="max-w-40" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="commentaire">Commentaire</Label>
        <Textarea id="commentaire" name="commentaire" rows={4} />
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
