"use client";

import { useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { restaurerSecret, supprimerDefinitivement } from "@/lib/actions/one-vault";

type Secret = { id: string; titre: string; partage: boolean; supprimeLe: Date | null };

export function LigneCorbeille({ secret, peutGerer }: { secret: Secret; peutGerer: boolean }) {
  const [restaurationEnCours, demarrerRestauration] = useTransition();
  const [suppressionEnCours, demarrerSuppression] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{secret.titre}</p>
          <Badge variant={secret.partage ? "info" : "neutral"}>{secret.partage ? "Partagé" : "Privé"}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Supprimé le {secret.supprimeLe ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(secret.supprimeLe) : "—"}
        </p>
      </div>
      {peutGerer ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" disabled={restaurationEnCours} onClick={() => demarrerRestauration(() => restaurerSecret(secret.id))}>
            {restaurationEnCours ? <Spinner /> : <RotateCcw data-icon="inline-start" aria-hidden />}
            Restaurer
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Supprimer définitivement"
            className="text-muted-foreground hover:text-destructive"
            disabled={suppressionEnCours}
            onClick={() => {
              if (window.confirm("Supprimer définitivement ce secret ? Cette action est irréversible.")) {
                demarrerSuppression(() => supprimerDefinitivement(secret.id));
              }
            }}
          >
            {suppressionEnCours ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" aria-hidden />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
