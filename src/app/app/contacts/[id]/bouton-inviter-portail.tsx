"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { creerInvitation } from "@/lib/actions/invitation";

/**
 * Assistance client (échange du 2026-09-13) — invite ce Contact précis au
 * portail (roleProposee="CLIENT", contactId renseigné) via le flux
 * invitation existant, jamais une nouvelle mécanique de création de compte.
 */
export function BoutonInviterPortail({ contactId, emailActuel }: { contactId: string; emailActuel: string | null }) {
  const [etat, action, enCours] = useActionState(creerInvitation, null);
  const [ouvert, setOuvert] = useState(false);

  if (etat?.succes) {
    return <p className="text-sm text-emerald-700">{etat.succes}</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <UserPlus data-icon="inline-start" aria-hidden />
        Inviter au portail
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <input type="hidden" name="roleProposee" value="CLIENT" />
      <input type="hidden" name="contactId" value={contactId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="email-invitation-portail">Email</Label>
        <Input id="email-invitation-portail" name="email" type="email" defaultValue={emailActuel ?? ""} required className="w-56" />
      </div>
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner className="size-3.5" /> : null}
        Envoyer l&apos;invitation
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
        Annuler
      </Button>
      {etat?.erreur ? <p className="w-full text-xs text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
