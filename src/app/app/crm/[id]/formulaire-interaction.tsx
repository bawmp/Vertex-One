"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ajouterInteraction } from "@/lib/actions/prospect";

export function FormulaireInteraction({ prospectId }: { prospectId: string }) {
  const [etat, action, enCours] = useActionState(ajouterInteraction, null);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border p-4">
      <input type="hidden" name="prospectId" value={prospectId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          defaultValue="note"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="appel">Appel</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="rendez-vous">Rendez-vous</option>
          <option value="note">Note</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contenu">Note</Label>
        <textarea
          id="contenu"
          name="contenu"
          required
          rows={3}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
        />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="self-start">
        {enCours ? "Ajout…" : "Ajouter"}
      </Button>
    </form>
  );
}
