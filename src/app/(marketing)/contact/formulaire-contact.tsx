"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { envoyerMessageContact } from "@/lib/actions/message-contact";

export function FormulaireContact() {
  const [etat, action, enCours] = useActionState(envoyerMessageContact, null);

  if (etat?.succes) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-8 text-center">
        <Check className="size-8 text-primary" aria-hidden />
        <p className="font-medium">Message envoyé — merci !</p>
        <p className="text-sm text-muted-foreground">Nous revenons vers vous rapidement.</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Nom</Label>
        <Input id="nom" name="nom" required minLength={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="entreprise">Entreprise (optionnel)</Label>
        <Input id="entreprise" name="entreprise" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required minLength={10} rows={5} />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi en cours…" : "Envoyer le message"}
      </Button>
    </form>
  );
}
