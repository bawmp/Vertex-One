"use client";

import { Button } from "@/components/ui/button";
import { changerStatutProjet } from "@/lib/actions/projet";
import { STATUT_PROJET } from "@/lib/libelles";

const STATUTS = ["A_FAIRE", "EN_COURS", "EN_REVISION", "TERMINE", "ANNULE"] as const;

export function ChangeurStatutProjet({ projetId, statutActuel }: { projetId: string; statutActuel: string }) {
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {STATUTS.map((valeur) => {
        const actif = statutActuel === valeur;
        return (
          <form key={valeur} action={changerStatutProjet.bind(null, projetId, valeur)}>
            <Button
              type="submit"
              variant={actif ? "default" : "ghost"}
              size="sm"
              className={actif ? "shadow-sm" : "text-muted-foreground"}
            >
              {STATUT_PROJET[valeur].libelle}
            </Button>
          </form>
        );
      })}
    </div>
  );
}
