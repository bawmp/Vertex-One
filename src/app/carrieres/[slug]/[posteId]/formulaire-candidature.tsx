"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { soumettreCandidature } from "@/lib/actions/recrutement-publique";

export function FormulaireCandidature({ slug, posteId }: { slug: string; posteId: string }) {
  const [etat, action, enCours] = useActionState(soumettreCandidature, null);

  if (etat?.succes) {
    return <p className="text-sm text-emerald-700">Merci pour votre candidature ! Nous reviendrons vers vous rapidement.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="posteId" value={posteId} />

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message (optionnel)</Label>
        <Input id="message" name="message" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cv">CV (PDF ou Word, 5 Mo max)</Label>
        <input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx" required className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium" />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer ma candidature"}
      </Button>
    </form>
  );
}
