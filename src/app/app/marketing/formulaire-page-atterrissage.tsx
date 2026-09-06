"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerPageAtterrissage } from "@/lib/actions/page-atterrissage";

export function FormulairePageAtterrissage() {
  const [etat, action, enCours] = useActionState(creerPageAtterrissage, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle page d&apos;atterrissage
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle page d&apos;atterrissage</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="titre">Titre</Label>
              <Input id="titre" name="titre" required minLength={2} autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Adresse (slug)</Label>
              <Input id="slug" name="slug" placeholder="garage-mbarga" required pattern="[a-z0-9-]+" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="texte">Texte de présentation</Label>
            <Textarea id="texte" name="texte" rows={4} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="imageUrl">URL d&apos;image (optionnelle)</Label>
              <Input id="imageUrl" name="imageUrl" type="url" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="texteBouton">Texte du bouton</Label>
              <Input id="texteBouton" name="texteBouton" defaultValue="Nous contacter" />
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
