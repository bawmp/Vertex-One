import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { validerClearance, supprimerClearance } from "@/lib/actions/depart";

type Clearance = { id: string; libelle: string; responsableId: string; responsableNom: string; complete: boolean; completeLe: Date | null };

export function ListeClearances({ clearances, utilisateurId, peutSupprimer }: { clearances: Clearance[]; utilisateurId: string; peutSupprimer: boolean }) {
  if (clearances.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune clôture pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {clearances.map((c) => {
          const peutValider = !c.complete && (c.responsableId === utilisateurId || peutSupprimer);
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                {c.complete ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <div>
                  <p className={c.complete ? "font-medium line-through text-muted-foreground" : "font-medium"}>{c.libelle}</p>
                  <p className="text-xs text-muted-foreground">Responsable : {c.responsableNom}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {peutValider ? (
                  <form action={validerClearance.bind(null, c.id)}>
                    <Button type="submit" size="xs" variant="outline">
                      Valider
                    </Button>
                  </form>
                ) : null}
                {peutSupprimer ? (
                  <form action={supprimerClearance.bind(null, c.id)}>
                    <Button type="submit" size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label="Supprimer">
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
