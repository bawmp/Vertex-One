"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerShift } from "@/lib/actions/shift";

export function FormulaireNouveauShift() {
  const [etat, action, enCours] = useActionState(creerShift, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau shift
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau shift</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input id="nom" name="nom" placeholder="Matin" required className="max-w-48" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureDebut">Début</Label>
              <Input id="heureDebut" name="heureDebut" type="time" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureFin">Fin</Label>
              <Input id="heureFin" name="heureFin" type="time" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="toleranceMinutes">Tolérance (min)</Label>
              <Input id="toleranceMinutes" name="toleranceMinutes" type="number" min={0} defaultValue={0} />
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
