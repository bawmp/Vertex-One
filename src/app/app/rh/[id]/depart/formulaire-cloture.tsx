"use client";

import { useActionState, useState } from "react";
import { DoorClosed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cloturerDepart } from "@/lib/actions/depart";

export function FormulaireCloture({ demandeDepartId }: { demandeDepartId: string }) {
  const [etat, action, enCours] = useActionState(cloturerDepart, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <DoorClosed data-icon="inline-start" aria-hidden />
        Clôturer le départ
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clôturer le départ</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="demandeDepartId" value={demandeDepartId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="entretienSortie">Entretien de sortie (optionnel)</Label>
            <Textarea id="entretienSortie" name="entretienSortie" rows={3} />
          </div>

          <p className="text-xs text-muted-foreground">
            Ceci désactive le compte de l&apos;employé et met fin à ses sessions actives — action définitive.
          </p>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Clôture…" : "Clôturer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
