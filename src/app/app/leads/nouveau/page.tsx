"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerLead } from "@/lib/actions/lead";

export default function PageNouveauLead() {
  const [etat, action, enCours] = useActionState(creerLead, null);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Nouveau lead</CardTitle>
        <CardDescription>Assigné à vous par défaut. À qualifier puis convertir en Contact/Deal.</CardDescription>
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
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le lead"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
