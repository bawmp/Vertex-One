"use client";

import { FileSignature, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resilierContrat } from "@/lib/actions/contrat";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  ACTIF: { libelle: "Actif", variante: "success" },
  EXPIRE: { libelle: "Expiré", variante: "warning" },
  RESILIE: { libelle: "Résilié", variante: "neutral" },
};

type Contrat = {
  id: string;
  titre: string;
  dateDebut: Date;
  dateFin: Date | null;
  renouvellementAuto: boolean;
  statut: string;
};

export function ListeContrats({ contrats, peutModifier }: { contrats: Contrat[]; peutModifier: boolean }) {
  if (contrats.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun contrat pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {contrats.map((c) => {
          const info = LIBELLE_STATUT[c.statut] ?? { libelle: c.statut, variante: "neutral" as const };
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <p className="flex min-w-0 items-center gap-1.5 truncate">
                <FileSignature className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{c.titre}</span>
                {c.renouvellementAuto ? <RefreshCw className="size-3 shrink-0 text-muted-foreground" aria-hidden /> : null}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {c.dateFin ? (
                  <span className="text-xs text-muted-foreground">
                    jusqu&apos;au {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(c.dateFin)}
                  </span>
                ) : null}
                <Badge variant={info.variante}>{info.libelle}</Badge>
                {peutModifier && c.statut === "ACTIF" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => resilierContrat(c.id)}
                    aria-label={`Résilier ${c.titre}`}
                    className="hover:text-destructive"
                  >
                    ✕
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
