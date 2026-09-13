"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { changerStatutCandidature, assignerCandidature } from "@/lib/actions/recrutement";

const STATUTS = [
  { valeur: "RECUE", libelle: "Reçue" },
  { valeur: "EN_EXAMEN", libelle: "En examen" },
  { valeur: "ENTRETIEN", libelle: "Entretien" },
  { valeur: "OFFRE", libelle: "Offre" },
  { valeur: "EMBAUCHE", libelle: "Embauché(e)" },
  { valeur: "REJETEE", libelle: "Rejetée" },
] as const;

export function ControlesCandidature({
  candidatureId,
  statut,
  peutReassigner,
  agents,
  agentActuelId,
}: {
  candidatureId: string;
  statut: string;
  peutReassigner: boolean;
  agents: { id: string; nomComplet: string }[];
  agentActuelId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`statut-${candidatureId}`}>Statut</Label>
        <Select
          id={`statut-${candidatureId}`}
          defaultValue={statut}
          className="w-36"
          onChange={(e) => changerStatutCandidature(candidatureId, e.target.value as (typeof STATUTS)[number]["valeur"])}
        >
          {STATUTS.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </Select>
      </div>
      {peutReassigner ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`agent-${candidatureId}`}>Recruteur</Label>
          <Select id={`agent-${candidatureId}`} defaultValue={agentActuelId ?? ""} className="w-44" onChange={(e) => assignerCandidature(candidatureId, e.target.value)}>
            <option value="">—</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nomComplet}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
