"use client";

import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerDemandeConge } from "@/lib/actions/rh";

export function FormulaireDemandeConge() {
  const [etat, action, enCours] = useActionState(creerDemandeConge, null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState("CONGE_PAYE");

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <CalendarPlus data-icon="inline-start" aria-hidden />
        Demander un congé
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demander un congé</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Type</Label>
            <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-44">
              <option value="CONGE_PAYE">Congé payé</option>
              <option value="MALADIE">Maladie</option>
              <option value="SANS_SOLDE">Sans solde</option>
              <option value="AUTRE">Autre</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateDebut">Du</Label>
              <Input id="dateDebut" name="dateDebut" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFin">Au</Label>
              <Input id="dateFin" name="dateFin" type="date" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombreJours">Nombre de jours</Label>
              <Input id="nombreJours" name="nombreJours" type="number" step="0.5" min="0.5" required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="motif">Motif (optionnel)</Label>
            <Textarea id="motif" name="motif" rows={2} />
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
