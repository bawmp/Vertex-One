import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n/langue";

type RevisionSalaire = { id: string; ancienSalaire: number | null; nouveauSalaire: number; motif: string | null; effectueParNom: string; creeLe: Date };

const formaterFCFA = (montant: number) => `${new Intl.NumberFormat("fr-FR").format(montant)} FCFA`;

export async function ListeRevisionsSalaire({ revisions }: { revisions: RevisionSalaire[] }) {
  const t = await getT();
  if (revisions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Aucune révision pour le moment.")}</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {revisions.map((r, index) => (
          <div
            key={r.id}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-1 px-4 py-2.5 text-sm duration-300 fill-mode-both"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {r.ancienSalaire != null ? `${formaterFCFA(r.ancienSalaire)} → ${formaterFCFA(r.nouveauSalaire)}` : t("Salaire initial : {montant}", { montant: formaterFCFA(r.nouveauSalaire) })}
              </p>
              <span className="text-xs text-muted-foreground">
                {r.effectueParNom} — {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(r.creeLe)}
              </span>
            </div>
            {r.motif ? <p className="text-muted-foreground">{r.motif}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
