"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerCategorieTicketSupport } from "@/lib/actions/ticket-support";

export function FormulaireNouvelleCategorie({ utilisateurs }: { utilisateurs: { id: string; nomComplet: string }[] }) {
  const [etat, action, enCours] = useActionState(creerCategorieTicketSupport, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouvelle catégorie
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="nom">Nom de la catégorie</Label>
          <Input id="nom" name="nom" placeholder="ex : Facturation, Livraison, Général" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agentId">Agent par défaut</Label>
          <Select id="agentId" name="agentId" required>
            <option value="">Sélectionner…</option>
            {utilisateurs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nomComplet}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Création…" : "Créer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
