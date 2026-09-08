"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { modifierDossierRH } from "@/lib/actions/rh";

function versDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function FormulaireDossierRH({
  dossierRHId,
  poste,
  typeContrat,
  dateEmbauche,
  dateFinContrat,
  nombrePersonnesACharge,
}: {
  dossierRHId: string;
  poste: string;
  typeContrat: string;
  dateEmbauche: Date;
  dateFinContrat: Date | null;
  nombrePersonnesACharge: number;
}) {
  const [etat, action, enCours] = useActionState(modifierDossierRH, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Pencil data-icon="inline-start" aria-hidden />
        Modifier
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modifier le dossier RH</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="dossierRHId" value={dossierRHId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="poste">Poste</Label>
            <Input id="poste" name="poste" defaultValue={poste} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="typeContrat">Type de contrat</Label>
              <Select id="typeContrat" name="typeContrat" defaultValue={typeContrat}>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
                <option value="STAGE">Stage</option>
                <option value="PRESTATAIRE">Prestataire</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nombrePersonnesACharge">Personnes à charge</Label>
              <Input id="nombrePersonnesACharge" name="nombrePersonnesACharge" type="number" min={0} defaultValue={nombrePersonnesACharge} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateEmbauche">Date d&apos;embauche</Label>
              <Input id="dateEmbauche" name="dateEmbauche" type="date" defaultValue={versDateInput(dateEmbauche)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dateFinContrat">Fin de contrat (si CDD)</Label>
              <Input id="dateFinContrat" name="dateFinContrat" type="date" defaultValue={versDateInput(dateFinContrat)} />
            </div>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Enregistrement…" : "Enregistrer"}
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
