import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterRegularisation } from "@/lib/actions/regularisation-pointage";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: m("En attente"), variante: "warning" },
  APPROUVEE: { libelle: m("Approuvée"), variante: "success" },
  REFUSEE: { libelle: m("Refusée"), variante: "neutral" },
};

type Regularisation = {
  id: string;
  date: Date;
  heureArriveeProposee: Date | null;
  heureDepartProposee: Date | null;
  motif: string;
  statut: string;
};

function formaterHeure(d: Date | null, locale: string): string | null {
  return d ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(d) : null;
}

export async function ListeRegularisations({ regularisations, peutTraiter }: { regularisations: Regularisation[]; peutTraiter: boolean }) {
  const t = await getT();
  if (regularisations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Aucune régularisation pour le moment.")}</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {regularisations.map((r, index) => {
          const info = LIBELLE_STATUT[r.statut] ?? { libelle: r.statut, variante: "neutral" as const };
          const arrivee = formaterHeure(r.heureArriveeProposee, t.locale);
          const depart = formaterHeure(r.heureDepartProposee, t.locale);
          return (
            <div
              key={r.id}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-1.5 px-4 py-2.5 text-sm duration-300 fill-mode-both"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(r.date)}
                  {arrivee ? ` — ${t("arrivée {heure}", { heure: arrivee })}` : ""}
                  {depart ? ` — ${t("départ {heure}", { heure: depart })}` : ""}
                </p>
                <Badge variant={info.variante}>{t(info.libelle)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{r.motif}</p>
              {r.statut === "EN_ATTENTE" && peutTraiter ? (
                <div className="flex gap-2">
                  <form action={traiterRegularisation.bind(null, r.id, "approuver")}>
                    <Button type="submit" size="xs" variant="outline">
                      {t("Approuver")}
                    </Button>
                  </form>
                  <form action={traiterRegularisation.bind(null, r.id, "refuser")}>
                    <Button type="submit" size="xs" variant="ghost" className="hover:text-destructive">
                      {t("Refuser")}
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
