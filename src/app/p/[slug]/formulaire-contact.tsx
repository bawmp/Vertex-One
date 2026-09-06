"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { soumettreFormulaireContact } from "@/lib/actions/page-atterrissage";

export function FormulaireContactPublic({ slug, texteBouton }: { slug: string; texteBouton: string }) {
  const [etat, action, enCours] = useActionState(soumettreFormulaireContact, null);

  if (etat?.succes) {
    return <p className="text-sm text-emerald-700">Merci, nous vous recontactons très vite !</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Votre nom</Label>
        <Input id="nom" name="nom" required minLength={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="telephone">Téléphone</Label>
        <Input id="telephone" name="telephone" required minLength={6} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email (optionnel)</Label>
        <Input id="email" name="email" type="email" />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : texteBouton}
      </Button>
    </form>
  );
}
