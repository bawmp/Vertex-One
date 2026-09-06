"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { enregistrerInfosLegales } from "@/lib/actions/entreprise-legal";
import type { entreprise } from "@/db/schema";

export function FormulaireInfosLegales({ entreprise: monEntreprise }: { entreprise: typeof entreprise.$inferSelect }) {
  const [etat, action, enCours] = useActionState(enregistrerInfosLegales, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="niu">NIU (Numéro d&apos;Identifiant Unique)</Label>
        <Input id="niu" name="niu" required defaultValue={monEntreprise.niu ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rccm">RCCM</Label>
        <Input id="rccm" name="rccm" defaultValue={monEntreprise.rccm ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="adresse">Adresse</Label>
        <Input id="adresse" name="adresse" defaultValue={monEntreprise.adresse ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ville">Ville</Label>
        <Input id="ville" name="ville" defaultValue={monEntreprise.ville ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="assujettiTVA">Assujetti à la TVA (19,25%)</Label>
        <Select id="assujettiTVA" name="assujettiTVA" defaultValue={monEntreprise.assujettiTVA ? "oui" : "non"}>
          <option value="oui">Oui</option>
          <option value="non">Non — régime simplifié / exonéré</option>
        </Select>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours}>
        {enCours ? <Spinner /> : null}
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
