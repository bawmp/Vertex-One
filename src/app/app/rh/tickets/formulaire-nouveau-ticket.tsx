"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerTicketRH } from "@/lib/actions/ticket-rh";

export function FormulaireNouveauTicket({ categories }: { categories: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState(creerTicketRH, null);
  const [ouvert, setOuvert] = useState(false);

  if (categories.length === 0) return null;

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau ticket
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="categorieId">Catégorie</Label>
          <Select id="categorieId" name="categorieId" required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="titre">Titre</Label>
          <Input id="titre" name="titre" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optionnel)</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Envoi…" : "Ouvrir le ticket"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
