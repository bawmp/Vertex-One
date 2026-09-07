"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { definirDateVerrouillage } from "@/lib/actions/verrouillage-comptable";

export function FormulaireVerrouillage({ dateVerrouillage }: { dateVerrouillage: Date | null }) {
  const [etat, action, enCours] = useActionState(definirDateVerrouillage, null);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="dateVerrouillage" className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden />
          Verrouiller les écritures jusqu&apos;au
        </Label>
        <Input id="dateVerrouillage" name="dateVerrouillage" type="date" defaultValue={dateVerrouillage?.toISOString().slice(0, 10) ?? ""} />
        <p className="text-xs text-muted-foreground">Aucune écriture (facture, dépense, paiement, journal manuel...) ne pourra être datée à cette date ou avant. Laisser vide pour lever le verrouillage.</p>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? <Spinner /> : null}
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
