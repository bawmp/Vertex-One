"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerInfosPersonnelles, type EtatFiche } from "@/lib/actions/fiche-collaborateur";

type Valeurs = { dateNaissance: string; telephone: string; adresse: string; urgenceNom: string; urgenceTelephone: string };

/** Date de naissance (rappel des anniversaires), coordonnées et personne à prévenir. Modifiable par la personne, l'Administrateur et son Manager. */
export function FormulaireInfosPersonnelles({ dossierRHId, valeurs }: { dossierRHId: string; valeurs: Valeurs }) {
  const [etat, action, enCours] = useActionState(enregistrerInfosPersonnelles.bind(null, dossierRHId), null as EtatFiche);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateNaissance">Date de naissance</Label>
          <Input id="dateNaissance" name="dateNaissance" type="date" defaultValue={valeurs.dateNaissance} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telephone">Téléphone</Label>
          <Input id="telephone" name="telephone" type="tel" defaultValue={valeurs.telephone} maxLength={30} placeholder="+237 690 00 00 00" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="adresse">Adresse</Label>
          <Input id="adresse" name="adresse" defaultValue={valeurs.adresse} maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="urgenceNom">Personne à prévenir en cas d&apos;urgence</Label>
          <Input id="urgenceNom" name="urgenceNom" defaultValue={valeurs.urgenceNom} maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="urgenceTelephone">Son téléphone</Label>
          <Input id="urgenceTelephone" name="urgenceTelephone" type="tel" defaultValue={valeurs.urgenceTelephone} maxLength={30} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          Enregistrer
        </Button>
        {etat?.erreur ? <p role="alert" className="text-sm text-destructive">{etat.erreur}</p> : null}
        {etat?.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
      </div>
    </form>
  );
}
