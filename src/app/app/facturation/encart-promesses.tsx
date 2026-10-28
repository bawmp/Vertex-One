import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { aujourdhuiDouala, ecartEnJours, formaterJourPromesse } from "@/lib/facturation/promesse-regles";
import { getT } from "@/lib/i18n/langue";

type PromesseAttendue = { id: string; factureId: string; numero: string; nomClient: string | null; datePromise: string; montant: number };

/**
 * Suivi des promesses de paiement attendues dans les 7 prochains jours (et celles dont la date est passée sans encore être
 * traitées) : qui rappeler, pour quelle facture, et quand. Ne montre que les factures visibles par la personne (portée de la
 * facturation, déjà appliquée par l'appelant). N'affiche rien quand il n'y en a pas.
 */
export async function EncartPromesses({ promesses }: { promesses: PromesseAttendue[] }) {
  const t = await getT();
  if (promesses.length === 0) return null;
  const aujourdhui = aujourdhuiDouala();

  return (
    <section aria-labelledby="titre-promesses-attendues" className="flex flex-col gap-2">
      <h2 id="titre-promesses-attendues" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CalendarClock className="size-4" aria-hidden />
        {t("Promesses de paiement attendues cette semaine")}
      </h2>
      <Card className="p-0">
        <div className="flex flex-col divide-y divide-border">
          {promesses.slice(0, 8).map((p) => {
            const ecart = ecartEnJours(aujourdhui, p.datePromise);
            const quand = ecart < 0 ? t("date dépassée") : ecart === 0 ? t("aujourd'hui") : ecart === 1 ? t("demain") : t("dans {n} jours", { n: ecart });
            return (
              <Link key={p.id} href={`/app/facturation/factures/${p.factureId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{p.numero}</span>
                  <span className="text-muted-foreground"> — {p.nomClient ?? t("Client")}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">{formaterFCFA(p.montant)}</span>
                  <Badge variant={ecart < 0 ? "warning" : ecart === 0 ? "info" : "neutral"}>
                    {formaterJourPromesse(p.datePromise, t.locale, "medium")} · {quand}
                  </Badge>
                </span>
              </Link>
            );
          })}
          {promesses.length > 8 ? <p className="px-4 py-2 text-xs text-muted-foreground">{t("… et {n} autres.", { n: promesses.length - 8 })}</p> : null}
        </div>
      </Card>
    </section>
  );
}
