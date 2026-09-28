"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formaterTaille } from "@/lib/one-form/fichiers";

type Champ = { id: string; libelle: string };
type FichierRecu = { valeurId: string; nom: string; taille: number };
type Reponse = { id: string; creeLe: Date; leadCree: boolean; valeurs: Record<string, string>; fichiers: Record<string, FichierRecu> };

export function ListeReponses({ champs, reponses }: { champs: Champ[]; reponses: Reponse[] }) {
  const [ouvertId, setOuvertId] = useState<string | null>(null);

  if (reponses.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune réponse pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {reponses.map((r, index) => {
          const ouvert = ouvertId === r.id;
          const apercu = champs
            .map((c) => r.valeurs[c.id])
            .find((v) => !!v);
          return (
            <div key={r.id}>
              <button
                type="button"
                onClick={() => setOuvertId(ouvert ? null : r.id)}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                className="group/ligne relative flex w-full animate-in fade-in slide-in-from-bottom-1 items-center justify-between gap-3 overflow-hidden px-4 py-3 text-left text-sm fill-mode-both duration-300 hover:bg-muted/50"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-primary transition-transform duration-150 group-hover/ligne:scale-y-100"
                />
                <div className="flex min-w-0 items-center gap-2 transition-transform duration-150 group-hover/ligne:translate-x-1">
                  {ouvert ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="truncate">{apercu ?? (Object.keys(r.fichiers).length > 0 ? "Fichier reçu" : "—")}</span>
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
                      {r.fichiers[c.id] ? (
                        <a
                          href={`/app/one-form/fichier/${r.fichiers[c.id].valeurId}`}
                          className="flex min-w-0 items-center gap-1.5 text-right text-primary underline-offset-2 hover:underline"
                        >
                          <Paperclip className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{r.fichiers[c.id].nom}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">({formaterTaille(r.fichiers[c.id].taille)})</span>
                        </a>
                      ) : (
                        <span className="text-right">{r.valeurs[c.id] ?? "—"}</span>
                      )}
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
