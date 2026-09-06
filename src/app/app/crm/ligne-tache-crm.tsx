"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { changerStatutTacheCrm } from "@/lib/actions/activite-crm";
import { STATUT_TACHE_CRM, PRIORITE_TACHE_CRM } from "@/lib/libelles";

type StatutTacheCrm = "NON_COMMENCEE" | "EN_COURS" | "TERMINEE" | "DIFFEREE";

export function LigneTacheCrm({
  id,
  objet,
  statut,
  priorite,
  dateEcheance,
  relatifA,
  nomContact,
}: {
  id: string;
  objet: string;
  statut: StatutTacheCrm;
  priorite: string;
  dateEcheance: Date | null;
  relatifA: string | null;
  nomContact: string | null;
}) {
  const [enCours, startTransition] = useTransition();
  const infoPriorite = PRIORITE_TACHE_CRM[priorite];

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2.5">{objet}</td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {dateEcheance ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(dateEcheance) : "—"}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {enCours ? <Spinner className="size-3.5" /> : null}
          <Select
            aria-label={`Statut de la tâche ${objet}`}
            defaultValue={statut}
            disabled={enCours}
            className="w-36"
            onChange={(e) => {
              const valeur = e.target.value as StatutTacheCrm;
              startTransition(() => {
                changerStatutTacheCrm(id, valeur);
              });
            }}
          >
            {Object.entries(STATUT_TACHE_CRM).map(([valeur, info]) => (
              <option key={valeur} value={valeur}>
                {info.libelle}
              </option>
            ))}
          </Select>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant={infoPriorite?.variante ?? "neutral"}>{infoPriorite?.libelle ?? priorite}</Badge>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{relatifA ?? "—"}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{nomContact ?? "—"}</td>
    </tr>
  );
}
