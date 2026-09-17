"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

type Champ = { id: string; libelle: string };
type Reponse = { id: string; creeLe: Date; leadCree: boolean; valeurs: Record<string, string> };

export function ListeReponses({ champs, reponses }: { champs: Champ[]; reponses: Reponse[] }) {
  const [ouvertId, setOuvertId] = useState<string | null>(null);

  if (reponses.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune réponse pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {reponses.map((r) => {
          const ouvert = ouvertId === r.id;
          const apercu = champs
            .map((c) => r.valeurs[c.id])
            .find((v) => !!v);
          return (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => setOuvertId(ouvert ? null : r.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {ouvert ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="truncate">{apercu ?? "—"}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {r.leadCree ? <span className="text-emerald-600">Lead créé</span> : null}
                  <span>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(r.creeLe)}</span>
                </div>
              </button>
              {ouvert ? (
                <div className="flex flex-col gap-2 bg-muted/30 px-4 py-3 text-sm">
                  {champs.map((c) => (
                    <div key={c.id} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{c.libelle}</span>
                      <span className="text-right">{r.valeurs[c.id] ?? "—"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
