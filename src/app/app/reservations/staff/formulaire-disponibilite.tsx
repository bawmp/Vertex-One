"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ajouterDisponibilite } from "@/lib/actions/reservations";

const JOURS = [
  { valeur: "LUNDI", libelle: "Lundi" },
  { valeur: "MARDI", libelle: "Mardi" },
  { valeur: "MERCREDI", libelle: "Mercredi" },
  { valeur: "JEUDI", libelle: "Jeudi" },
  { valeur: "VENDREDI", libelle: "Vendredi" },
  { valeur: "SAMEDI", libelle: "Samedi" },
  { valeur: "DIMANCHE", libelle: "Dimanche" },
];

export function FormulaireDisponibilite({ intervenantId }: { intervenantId: string }) {
  const [etat, action, enCours] = useActionState(ajouterDisponibilite, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
      <input type="hidden" name="intervenantId" value={intervenantId} />
      <div className="flex flex-col gap-1">
        <Select name="jourSemaine" required className="w-28" defaultValue="LUNDI">
          {JOURS.map((j) => (
            <option key={j.valeur} value={j.valeur}>
              {j.libelle}
            </option>
          ))}
        </Select>
      </div>
      <Input name="heureDebut" type="time" required className="w-28" />
      <Input name="heureFin" type="time" required className="w-28" />
      <Button type="submit" size="xs" variant="outline" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Ajouter
      </Button>
      {etat?.erreur ? <p className="w-full text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
