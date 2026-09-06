"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerProspect } from "@/lib/actions/prospect";

export default function PageNouveauProspect() {
  const [etat, action, enCours] = useActionState(creerProspect, null);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Nouveau prospect</CardTitle>
        <CardDescription>Assigné à vous par défaut.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input id="nom" name="nom" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="societeCliente">Société (si B2B)</Label>
            <Input id="societeCliente" name="societeCliente" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="telephone">Téléphone (WhatsApp de préférence)</Label>
            <Input id="telephone" name="telephone" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="niu">NIU du client (si B2B)</Label>
            <Input id="niu" name="niu" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le prospect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
