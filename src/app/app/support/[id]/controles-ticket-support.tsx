"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { changerStatutTicketSupport, reassignerTicketSupport } from "@/lib/actions/ticket-support";

const STATUTS = [
  { valeur: "OUVERT", libelle: "Ouvert" },
  { valeur: "EN_COURS", libelle: "En cours" },
  { valeur: "RESOLU", libelle: "Résolu" },
  { valeur: "FERME", libelle: "Fermé" },
] as const;

export function ControlesTicketSupport({
  ticketId,
  statut,
  peutChangerStatut,
  peutReassigner,
  agents,
  agentActuelId,
}: {
  ticketId: string;
  statut: string;
  peutChangerStatut: boolean;
  peutReassigner: boolean;
  agents: { id: string; nomComplet: string }[];
  agentActuelId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {peutChangerStatut ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="statut">Statut</Label>
          <Select
            id="statut"
            defaultValue={statut}
            className="w-40"
            onChange={(e) => changerStatutTicketSupport(ticketId, e.target.value as (typeof STATUTS)[number]["valeur"])}
          >
            {STATUTS.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {peutReassigner ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="agent">Agent assigné</Label>
          <Select id="agent" defaultValue={agentActuelId ?? ""} className="w-48" onChange={(e) => reassignerTicketSupport(ticketId, e.target.value)}>
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
