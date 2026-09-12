import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterRegularisation } from "@/lib/actions/regularisation-pointage";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "warning" },
  APPROUVEE: { libelle: "Approuvée", variante: "success" },
  REFUSEE: { libelle: "Refusée", variante: "neutral" },
};

type Regularisation = {
  id: string;
  date: Date;
  heureArriveeProposee: Date | null;
  heureDepartProposee: Date | null;
  motif: string;
  statut: string;
};

function formaterHeure(d: Date | null): string | null {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(d) : null;
}

export function ListeRegularisations({ regularisations, peutTraiter }: { regularisations: Regularisation[]; peutTraiter: boolean }) {
  if (regularisations.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune régularisation pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {regularisations.map((r) => {
          const info = LIBELLE_STATUT[r.statut] ?? { libelle: r.statut, variante: "neutral" as const };
          const arrivee = formaterHeure(r.heureArriveeProposee);
          const depart = formaterHeure(r.heureDepartProposee);
          return (
            <div key={r.id} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(r.date)}
                  {arrivee ? ` — arrivée ${arrivee}` : ""}
                  {depart ? ` — départ ${depart}` : ""}
                </p>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{r.motif}</p>
              {r.statut === "EN_ATTENTE" && peutTraiter ? (
                <div className="flex gap-2">
                  <form action={traiterRegularisation.bind(null, r.id, "approuver")}>
                    <Button type="submit" size="xs" variant="outline">
                      Approuver
                    </Button>
                  </form>
                  <form action={traiterRegularisation.bind(null, r.id, "refuser")}>
                    <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                      Refuser
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
