"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerEntreeTemps } from "@/lib/actions/entree-temps";

export function FormulaireEntreeTemps({
  projetId,
  taches,
  tauxHoraireParDefaut,
}: {
  projetId: string;
  taches: { id: string; titre: string }[];
  tauxHoraireParDefaut: number | null;
}) {
  const [etat, action, enCours] = useActionState(creerEntreeTemps, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Enregistrer des heures
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="projetId" value={projetId} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dureeHeures">Durée (h)</Label>
          <Input id="dureeHeures" name="dureeHeures" type="number" step="0.25" min="0.25" required defaultValue="1" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tauxHoraire">Taux (FCFA/h)</Label>
          <Input id="tauxHoraire" name="tauxHoraire" type="number" min="0" defaultValue={tauxHoraireParDefaut ?? 0} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tacheId">Tâche (optionnel)</Label>
          <Select id="tacheId" name="tacheId" defaultValue="">
            <option value="">Aucune</option>
            {taches.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="note">Note (optionnel)</Label>
        <Input id="note" name="note" placeholder="Description du travail effectué" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="facturable" defaultChecked className="size-4" />
        Facturable
      </label>

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
