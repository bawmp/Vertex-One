"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ajouterClearance } from "@/lib/actions/depart";

export function FormulaireClearance({ demandeDepartId, collegues }: { demandeDepartId: string; collegues: { id: string; nomComplet: string }[] }) {
  const [etat, action, enCours] = useActionState(ajouterClearance, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Ajouter une clôture
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="demandeDepartId" value={demandeDepartId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" name="libelle" placeholder="ex : Restitution du matériel" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="responsableId">Responsable</Label>
          <Select id="responsableId" name="responsableId" required>
            <option value="">Sélectionner…</option>
            {collegues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nomComplet}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Ajout…" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
