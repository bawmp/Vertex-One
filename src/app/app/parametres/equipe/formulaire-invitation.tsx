"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creerInvitation } from "@/lib/actions/invitation";

export function FormulaireInvitation() {
  const [etat, action, enCours] = useActionState(creerInvitation, null);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email de l&apos;invité</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="roleProposee">Rôle</Label>
        <select
          id="roleProposee"
          name="roleProposee"
          required
          defaultValue="EMPLOYE"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="MANAGER">Manager</option>
          <option value="EMPLOYE">Employé</option>
          <option value="CLIENT">Client</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="postePropose">Poste</Label>
        <Input id="postePropose" name="postePropose" placeholder="Ex : Chargé de clientèle" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="typeContratPropose">Type de contrat</Label>
        <select
          id="typeContratPropose"
          name="typeContratPropose"
          defaultValue="CDI"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="CDI">CDI</option>
          <option value="CDD">CDD</option>
          <option value="STAGE">Stage</option>
          <option value="PRESTATAIRE">Prestataire</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dateEmbauchePropose">Date d&apos;embauche réelle</Label>
        <Input id="dateEmbauchePropose" name="dateEmbauchePropose" type="date" />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? <p className="text-sm text-emerald-600">{etat.succes}</p> : null}

      <Button type="submit" disabled={enCours}>
        {enCours ? "Envoi…" : "Inviter"}
      </Button>
    </form>
  );
}
