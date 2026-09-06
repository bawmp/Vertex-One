"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerTache } from "@/lib/actions/tache";

export function FormulaireNouvelleTache({
  projetId,
  collegues,
  utilisateurId,
}: {
  projetId: string;
  collegues: { id: string; nomComplet: string }[];
  utilisateurId: string;
}) {
  const [etat, action, enCours] = useActionState(creerTache, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle tâche
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="projetId" value={projetId} />

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="titre">Titre</Label>
          <Input id="titre" name="titre" required minLength={2} autoFocus />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="echeance">Échéance</Label>
          <Input id="echeance" name="echeance" type="date" className="max-w-40" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="assigneAId">Assignée à</Label>
        <Select id="assigneAId" name="assigneAId" defaultValue={utilisateurId} className="max-w-56">
          {collegues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nomComplet}
            </option>
          ))}
        </Select>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Ajout…" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
