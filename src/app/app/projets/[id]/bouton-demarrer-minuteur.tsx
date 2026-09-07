"use client";

import { useActionState, useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { demarrerMinuteur } from "@/lib/actions/minuteur";

export function BoutonDemarrerMinuteur({ projetId, taches }: { projetId: string; taches: { id: string; titre: string }[] }) {
  const [etat, action, enCours] = useActionState(demarrerMinuteur, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Timer data-icon="inline-start" aria-hidden />
        Démarrer le minuteur
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2 rounded-lg border p-2">
      <input type="hidden" name="projetId" value={projetId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="tacheIdMinuteur" className="sr-only">
          Tâche (optionnel)
        </Label>
        <Select id="tacheIdMinuteur" name="tacheId" defaultValue="" className="h-8 text-xs">
          <option value="">Aucune tâche</option>
          {taches.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titre}
            </option>
          ))}
        </Select>
      </div>
      {etat?.erreur ? <p className="text-xs text-destructive">{etat.erreur}</p> : null}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner /> : <Timer data-icon="inline-start" aria-hidden />}
        Démarrer
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
    </form>
  );
}
