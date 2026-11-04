import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { traiterDemandeConge } from "@/lib/actions/rh";
import { getT } from "@/lib/i18n/langue";
import { m } from "@/lib/i18n/catalogue";

const LIBELLE_TYPE: Record<string, string> = { CONGE_PAYE: m("Congé payé"), MALADIE: m("Maladie"), SANS_SOLDE: m("Sans solde"), AUTRE: m("Autre") };
const LIBELLE_STATUT: Record<string, { libelle: string; variante: "success" | "warning" | "neutral" }> = {
  EN_ATTENTE: { libelle: m("En attente"), variante: "warning" },
  APPROUVEE: { libelle: m("Approuvée"), variante: "success" },
  REFUSEE: { libelle: m("Refusée"), variante: "neutral" },
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

export async function ListeDemandesConge({
  demandes,
  peutTraiter,
  peutVoirMotifSensible,
}: {
  demandes: Demande[];
  peutTraiter: boolean;
  peutVoirMotifSensible: boolean;
}) {
  const t = await getT();
  if (demandes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Aucune demande de congé pour le moment.")}</p>;
  }

  return (
    <Card className="p-0">
      <div className="flex flex-col divide-y divide-border">
        {demandes.map((d, index) => {
          const info = LIBELLE_STATUT[d.statut] ?? { libelle: d.statut, variante: "neutral" as const };
          return (
            <div
              key={d.id}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              className="flex animate-in fade-in slide-in-from-bottom-1 flex-col gap-1.5 px-4 py-2.5 text-sm duration-300 fill-mode-both"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {t("{type} — {debut} au {fin} ({n} j.)", { type: t(LIBELLE_TYPE[d.type] ?? d.type), debut: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d.dateDebut), fin: new Intl.DateTimeFormat(t.locale, { dateStyle: "medium" }).format(d.dateFin), n: d.nombreJours })}
                </p>
                <Badge variant={info.variante}>{t(info.libelle)}</Badge>
              </div>
              {d.motif && (d.type !== "MALADIE" || peutVoirMotifSensible) ? <p className="text-xs text-muted-foreground">{d.motif}</p> : null}
              {d.statut === "EN_ATTENTE" && peutTraiter ? (
                <div className="flex gap-2">
                  <form action={traiterDemandeConge.bind(null, d.id, "approuver")}>
                    <Button type="submit" size="xs" variant="outline">
                      {t("Approuver")}
                    </Button>
                  </form>
                  <form action={traiterDemandeConge.bind(null, d.id, "refuser")}>
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
