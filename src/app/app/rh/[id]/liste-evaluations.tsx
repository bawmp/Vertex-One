import { Card } from "@/components/ui/card";

type Evaluation = { id: string; periode: string; commentaire: string | null; evaluateurNom: string; creeLe: Date };

export function ListeEvaluations({ evaluations }: { evaluations: Evaluation[] }) {
  if (evaluations.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune évaluation pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {evaluations.map((e, index) => (
          <div
            key={e.id}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-1 px-4 py-2.5 text-sm duration-300 fill-mode-both"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{e.periode}</p>
              <span className="text-xs text-muted-foreground">
                {e.evaluateurNom} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(e.creeLe)}
              </span>
            </div>
            {e.commentaire ? <p className="text-muted-foreground">{e.commentaire}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
