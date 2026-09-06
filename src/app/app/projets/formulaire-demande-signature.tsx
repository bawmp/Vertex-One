"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerDemandeSignature } from "@/lib/actions/signature";

export function FormulaireDemandeSignature({ documentId }: { documentId: string }) {
  const [etat, action, enCours] = useActionState(creerDemandeSignature, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`nom-${documentId}`}>Nom du signataire</Label>
          <Input id={`nom-${documentId}`} name="nom" required minLength={2} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`telephone-${documentId}`}>Téléphone</Label>
          <Input id={`telephone-${documentId}`} name="telephone" required minLength={8} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`email-${documentId}`}>Email (pour l&apos;envoi du lien)</Label>
          <Input id={`email-${documentId}`} name="email" type="email" />
        </div>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      {etat?.succes ? <p className="text-sm text-emerald-700">{etat.succes}</p> : null}
      <Button type="submit" disabled={enCours} size="sm" className="w-fit">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer la demande de signature"}
      </Button>
    </form>
  );
}
