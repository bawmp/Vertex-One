"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerPosteOuvert } from "@/lib/actions/recrutement";

export function FormulaireNouveauPoste() {
  const [etat, action, enCours] = useActionState(creerPosteOuvert, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau poste
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau poste</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">Titre</Label>
            <Input id="titre" name="titre" placeholder="Développeur web" required className="max-w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lieu">Lieu (optionnel)</Label>
            <Input id="lieu" name="lieu" placeholder="Douala" className="max-w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description (optionnel)</Label>
            <Input id="description" name="description" />
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
