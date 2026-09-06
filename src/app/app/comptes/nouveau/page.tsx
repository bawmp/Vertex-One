"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerCompteClient } from "@/lib/actions/compte-client";

export default function PageNouveauCompte() {
  const [etat, action, enCours] = useActionState(creerCompteClient, null);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Nouveau compte</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom de la société</Label>
            <Input id="nom" name="nom" required minLength={2} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="niu">NIU</Label>
            <Input id="niu" name="niu" />
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours}>
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le compte"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
