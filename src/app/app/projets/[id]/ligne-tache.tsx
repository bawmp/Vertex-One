"use client";

import { useT } from "@/lib/i18n/contexte";
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
  index = 0,
}: {
  id: string;
  titre: string;
  statut: StatutTache;
  assigneNom: string;
  echeance: Date | null;
  peutModifier: boolean;
  index?: number;
}) {
  const t = useT();
  const [enCours, startTransition] = useTransition();
  const termine = statut === "TERMINEE";

  return (
    <div
      className="group/ligne relative flex animate-in fade-in items-center gap-3 overflow-hidden px-4 py-2.5 text-sm fill-mode-both duration-300 transition-colors hover:bg-muted/50"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
      />
      <div className="flex min-w-0 flex-1 items-center gap-3 transition-transform duration-150 group-hover/ligne:translate-x-1">
        <CheckCircle2
          className={termine ? "size-4 shrink-0 text-emerald-600" : "size-4 shrink-0 text-muted-foreground/30"}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={termine ? "truncate text-muted-foreground line-through" : "truncate"}>{titre}</p>
          <p className="text-xs text-muted-foreground">
            {assigneNom}
            {echeance ? ` — échéance ${new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(echeance)}` : ""}
          </p>
        </div>
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
                {t(info.libelle)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
