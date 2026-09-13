"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerServiceReservable } from "@/lib/actions/reservations";

export function FormulaireNouveauService() {
  const [etat, action, enCours] = useActionState(creerServiceReservable, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau service
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau service</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input id="nom" name="nom" placeholder="Coupe homme" required className="max-w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description (optionnel)</Label>
            <Input id="description" name="description" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dureeMinutes">Durée (min)</Label>
              <Input id="dureeMinutes" name="dureeMinutes" type="number" min={5} step={5} defaultValue={30} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dureeTamponMinutes">Battement (min)</Label>
              <Input id="dureeTamponMinutes" name="dureeTamponMinutes" type="number" min={0} step={5} defaultValue={0} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prixFcfa">Prix (FCFA)</Label>
              <Input id="prixFcfa" name="prixFcfa" type="number" min={0} step={100} defaultValue={0} />
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
