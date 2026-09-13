"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { configurerParametresReservation } from "@/lib/actions/reservations";

type Params = { slug: string; titre: string; texte: string | null; delaiMinimumHeures: number; delaiMaximumJours: number } | null;

export function FormulaireParametres({ params }: { params: Params }) {
  const [etat, action, enCours] = useActionState(configurerParametresReservation, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration de la page publique</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Lien (partie de l&apos;URL)</Label>
            <Input id="slug" name="slug" placeholder="mon-salon" defaultValue={params?.slug ?? ""} required className="max-w-64" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="titre">Titre affiché aux clients</Label>
            <Input id="titre" name="titre" defaultValue={params?.titre ?? "Prendre rendez-vous"} required className="max-w-96" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="texte">Texte d&apos;accueil (optionnel)</Label>
            <Input id="texte" name="texte" defaultValue={params?.texte ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="delaiMinimumHeures">Préavis minimum (heures)</Label>
              <Input id="delaiMinimumHeures" name="delaiMinimumHeures" type="number" min={0} defaultValue={params?.delaiMinimumHeures ?? 24} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="delaiMaximumJours">Horizon de réservation (jours)</Label>
              <Input id="delaiMaximumJours" name="delaiMaximumJours" type="number" min={1} defaultValue={params?.delaiMaximumJours ?? 60} required />
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
