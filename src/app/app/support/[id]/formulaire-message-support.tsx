"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ajouterMessageTicketSupport } from "@/lib/actions/ticket-support";

export function FormulaireMessageSupport({ ticketId }: { ticketId: string }) {
  const [etat, action, enCours] = useActionState(ajouterMessageTicketSupport.bind(null, ticketId), null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <Textarea name="contenu" rows={3} placeholder="Écrire un message…" required />
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <Button type="submit" size="sm" disabled={enCours} className="self-start">
        {enCours ? <Spinner /> : null}
        {enCours ? "Envoi…" : "Envoyer"}
      </Button>
    </form>
  );
}
