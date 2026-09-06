"use client";

import { Button } from "@/components/ui/button";
import { changerStatutLead } from "@/lib/actions/lead";
import { STATUT_LEAD } from "@/lib/libelles";

const STATUTS = ["NOUVEAU", "CONTACTE", "QUALIFIE", "DISQUALIFIE"] as const;

export function ChangeurStatutLead({ leadId, statutActuel }: { leadId: string; statutActuel: string }) {
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {STATUTS.map((valeur) => {
        const actif = statutActuel === valeur;
        return (
          <form key={valeur} action={changerStatutLead.bind(null, leadId, valeur)}>
            <Button type="submit" variant={actif ? "default" : "ghost"} size="sm" className={actif ? "shadow-sm" : "text-muted-foreground"}>
              {STATUT_LEAD[valeur].libelle}
            </Button>
          </form>
        );
      })}
    </div>
  );
}
