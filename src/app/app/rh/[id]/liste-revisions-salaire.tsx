import { Card } from "@/components/ui/card";

type RevisionSalaire = { id: string; ancienSalaire: number | null; nouveauSalaire: number; motif: string | null; effectueParNom: string; creeLe: Date };

const formaterFCFA = (montant: number) => `${new Intl.NumberFormat("fr-FR").format(montant)} FCFA`;

export function ListeRevisionsSalaire({ revisions }: { revisions: RevisionSalaire[] }) {
  if (revisions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune révision pour le moment.</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {revisions.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {r.ancienSalaire != null ? `${formaterFCFA(r.ancienSalaire)} → ${formaterFCFA(r.nouveauSalaire)}` : `Salaire initial : ${formaterFCFA(r.nouveauSalaire)}`}
              </p>
              <span className="text-xs text-muted-foreground">
                {r.effectueParNom} — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(r.creeLe)}
              </span>
            </div>
            {r.motif ? <p className="text-muted-foreground">{r.motif}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
