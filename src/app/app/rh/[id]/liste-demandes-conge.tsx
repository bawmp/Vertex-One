import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterDemandeConge } from "@/lib/actions/rh";

const LIBELLE_TYPE: Record<string, string> = { CONGE_PAYE: "Congé payé", MALADIE: "Maladie", SANS_SOLDE: "Sans solde", AUTRE: "Autre" };
const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "warning" },
  APPROUVEE: { libelle: "Approuvée", variante: "success" },
  REFUSEE: { libelle: "Refusée", variante: "neutral" },
};

type Demande = {
  id: string;
  type: string;
  dateDebut: Date;
  dateFin: Date;
  nombreJours: number;
  statut: string;
  motif: string | null;
};

export function ListeDemandesConge({
  demandes,
  peutTraiter,
  peutVoirMotifSensible,
}: {
  demandes: Demande[];
  peutTraiter: boolean;
  peutVoirMotifSensible: boolean;
}) {
  if (demandes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune demande de congé pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {demandes.map((d) => {
          const info = LIBELLE_STATUT[d.statut] ?? { libelle: d.statut, variante: "neutral" as const };
          return (
            <div key={d.id} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {LIBELLE_TYPE[d.type] ?? d.type} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateDebut)} au{" "}
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateFin)} ({d.nombreJours} j.)
                </p>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </div>
              {d.motif && (d.type !== "MALADIE" || peutVoirMotifSensible) ? <p className="text-xs text-muted-foreground">{d.motif}</p> : null}
              {d.statut === "EN_ATTENTE" && peutTraiter ? (
                <div className="flex gap-2">
                  <form action={traiterDemandeConge.bind(null, d.id, "approuver")}>
                    <Button type="submit" size="xs" variant="outline">
                      Approuver
                    </Button>
                  </form>
                  <form action={traiterDemandeConge.bind(null, d.id, "refuser")}>
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
