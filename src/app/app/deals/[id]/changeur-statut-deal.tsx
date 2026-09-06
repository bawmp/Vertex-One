"use client";

import { Button } from "@/components/ui/button";
import { changerStatutDeal } from "@/lib/actions/deal";
import { STATUT_DEAL } from "@/lib/libelles";

const STATUTS = ["QUALIFICATION", "PROPOSITION", "NEGOCIATION", "GAGNE", "PERDU"] as const;

export function ChangeurStatutDeal({ dealId, statutActuel }: { dealId: string; statutActuel: string }) {
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {STATUTS.map((valeur) => {
        const actif = statutActuel === valeur;
        return (
          <form key={valeur} action={changerStatutDeal.bind(null, dealId, valeur)}>
            <Button type="submit" variant={actif ? "default" : "ghost"} size="sm" className={actif ? "shadow-sm" : "text-muted-foreground"}>
              {STATUT_DEAL[valeur].libelle}
            </Button>
          </form>
        );
      })}
    </div>
  );
}
