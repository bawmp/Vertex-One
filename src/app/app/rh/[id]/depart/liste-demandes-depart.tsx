import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterDemandeDepart } from "@/lib/actions/depart";

const LIBELLE_TYPE: Record<string, string> = { DEMISSION: "Démission", LICENCIEMENT: "Licenciement", FIN_CONTRAT: "Fin de contrat", AUTRE: "Autre" };
const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: "En attente", variante: "warning" },
  APPROUVEE: { libelle: "Approuvée", variante: "success" },
  REFUSEE: { libelle: "Refusée", variante: "neutral" },
  CLOTUREE: { libelle: "Clôturée", variante: "neutral" },
};

type Demande = {
  id: string;
  type: string;
  dateDepartSouhaitee: Date;
  dateDepartConfirmee: Date | null;
  statut: string;
  motif: string | null;
  entretienSortie: string | null;
};

export function ListeDemandesDepart({ demandes, peutTraiter }: { demandes: Demande[]; peutTraiter: boolean }) {
  if (demandes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune demande de départ pour le moment.</p>;
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
                  {LIBELLE_TYPE[d.type] ?? d.type} — souhaitée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateDepartSouhaitee)}
                  {d.dateDepartConfirmee ? ` (confirmée le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(d.dateDepartConfirmee)})` : ""}
                </p>
                <Badge variant={info.variante}>{info.libelle}</Badge>
              </div>
              {d.motif ? <p className="text-xs text-muted-foreground">{d.motif}</p> : null}
              {d.entretienSortie ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Entretien de sortie :</span> {d.entretienSortie}
                </p>
              ) : null}
              {d.statut === "EN_ATTENTE" && peutTraiter ? (
                <div className="flex gap-2">
                  <form action={traiterDemandeDepart.bind(null, d.id, "approuver", undefined)}>
                    <Button type="submit" size="xs" variant="outline">
                      Approuver
                    </Button>
                  </form>
                  <form action={traiterDemandeDepart.bind(null, d.id, "refuser", undefined)}>
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
