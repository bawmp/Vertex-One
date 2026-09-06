"use client";

import { Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { epinglerAnnonce, supprimerAnnonce } from "@/lib/actions/annonce";

export function LigneAnnonce({
  id,
  contenu,
  auteurNom,
  creeLe,
  epinglee,
  peutGerer,
}: {
  id: string;
  contenu: string;
  auteurNom: string;
  creeLe: Date;
  epinglee: boolean;
  peutGerer: boolean;
}) {
  return (
    <Card className={epinglee ? "ring-primary/30" : undefined}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{auteurNom}</p>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(creeLe)}
            </p>
          </div>
          {peutGerer ? (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => epinglerAnnonce(id, !epinglee)}
                aria-label={epinglee ? "Désépingler" : "Épingler"}
                title={epinglee ? "Désépingler" : "Épingler"}
              >
                {epinglee ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => supprimerAnnonce(id)}
                aria-label="Supprimer"
                title="Supprimer"
                className="hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm">{contenu}</p>
      </CardContent>
    </Card>
  );
}
