"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { changerStatutTache } from "@/lib/actions/tache";
import { STATUT_TACHE } from "@/lib/libelles";

type StatutTache = "A_FAIRE" | "EN_COURS" | "TERMINEE";

export function LigneTache({
  id,
  titre,
  statut,
  assigneNom,
  echeance,
  peutModifier,
}: {
  id: string;
  titre: string;
  statut: StatutTache;
  assigneNom: string;
  echeance: Date | null;
  peutModifier: boolean;
}) {
  const [enCours, startTransition] = useTransition();
  const termine = statut === "TERMINEE";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <CheckCircle2
        className={termine ? "size-4 shrink-0 text-emerald-600" : "size-4 shrink-0 text-muted-foreground/30"}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={termine ? "truncate text-muted-foreground line-through" : "truncate"}>{titre}</p>
        <p className="text-xs text-muted-foreground">
          {assigneNom}
          {echeance ? ` — échéance ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(echeance)}` : ""}
        </p>
      </div>
      {peutModifier ? (
        <div className="flex shrink-0 items-center gap-2">
          {enCours ? <Spinner className="size-3.5" /> : null}
          <Select
            aria-label={`Statut de la tâche ${titre}`}
            defaultValue={statut}
            disabled={enCours}
            className="w-32"
            onChange={(e) => {
              const valeur = e.target.value as StatutTache;
              startTransition(() => {
                changerStatutTache(id, valeur);
              });
            }}
          >
            {Object.entries(STATUT_TACHE).map(([valeur, info]) => (
              <option key={valeur} value={valeur}>
                {info.libelle}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
