"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { creerFormulaire } from "@/lib/actions/one-form";

export function FormulaireNouveauFormulaire() {
  const [etat, action, enCours] = useActionState(creerFormulaire, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)} className="self-start">
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau formulaire
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2 rounded-lg border p-3">
      <Input name="titre" placeholder="ex : Demande de devis" required autoFocus />
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner /> : "Créer"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
