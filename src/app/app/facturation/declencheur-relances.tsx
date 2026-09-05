"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { declencherRelances } from "@/lib/actions/relance";

export function DeclencheurRelances() {
  const [etat, formAction, enCours] = useActionState(async () => declencherRelances(), null);

  return (
    <div className="rounded-md border border-dashed p-4">
      <form action={formAction} className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={enCours}>
          {enCours ? "Vérification…" : "Vérifier les factures en retard maintenant"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Déclenchement manuel — la vérification quotidienne automatique n&apos;est pas encore branchée.
        </p>
      </form>

      {etat && "erreur" in etat ? <p className="mt-2 text-sm text-destructive">{etat.erreur}</p> : null}

      {etat && "resultats" in etat ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {etat.resultats.length === 0 ? (
            <li className="text-muted-foreground">Aucune facture nouvellement en retard.</li>
          ) : (
            etat.resultats.map((r, i) => (
              <li key={`${r.factureId}-${r.canal}-${i}`} className={r.envoye ? "text-emerald-600" : "text-muted-foreground"}>
                {r.numero} — relance {r.canal} : {r.envoye ? "envoyée" : `non envoyée (${r.erreur})`}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
