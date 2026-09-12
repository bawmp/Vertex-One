"use client";

import { useActionState, useState } from "react";
import { ClockAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerRegularisation } from "@/lib/actions/regularisation-pointage";

export function FormulaireRegularisation() {
  const [etat, action, enCours] = useActionState(creerRegularisation, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <ClockAlert data-icon="inline-start" aria-hidden />
        Demander une régularisation
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demander une régularisation de pointage</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Jour concerné</Label>
            <Input id="date" name="date" type="date" required max={new Date().toISOString().slice(0, 10)} className="max-w-48" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureArriveeProposee">Heure d&apos;arrivée corrigée</Label>
              <Input id="heureArriveeProposee" name="heureArriveeProposee" type="time" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="heureDepartProposee">Heure de départ corrigée</Label>
              <Input id="heureDepartProposee" name="heureDepartProposee" type="time" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motif">Motif</Label>
            <Textarea id="motif" name="motif" rows={2} required />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Envoi…" : "Envoyer la demande"}
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
