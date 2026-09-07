"use client";

import { useActionState, useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { demarrerMinuteur } from "@/lib/actions/minuteur";

export function FormulaireDemarrerMinuteur({
  projets,
  taches,
}: {
  projets: { id: string; libelle: string }[];
  taches: { id: string; titre: string; projetId: string }[];
}) {
  const [etat, action, enCours] = useActionState(demarrerMinuteur, null);
  const [projetId, setProjetId] = useState("");
  const tachesDuProjet = taches.filter((t) => t.projetId === projetId);

  return (
    <Card className="p-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="projetIdMinuteur">Projet</Label>
          <Select id="projetIdMinuteur" name="projetId" required value={projetId} onChange={(e) => setProjetId(e.target.value)}>
            <option value="">Sélectionner un projet…</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="tacheIdMinuteurGlobal">Tâche (optionnel)</Label>
          <Select id="tacheIdMinuteurGlobal" name="tacheId" defaultValue="" disabled={!projetId}>
            <option value="">Aucune tâche</option>
            {tachesDuProjet.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titre}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={enCours || !projetId}>
          {enCours ? <Spinner /> : <Timer data-icon="inline-start" aria-hidden />}
          Démarrer le minuteur
        </Button>
      </form>
      {etat?.erreur ? <p className="mt-2 text-sm text-destructive">{etat.erreur}</p> : null}
    </Card>
  );
}
