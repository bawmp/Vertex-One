"use client";

import { useActionState } from "react";
import { BellRing, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { declencherRelances } from "@/lib/actions/relance";
import { useT } from "@/lib/i18n/contexte";

export function DeclencheurRelances() {
  const t = useT();
  const [etat, formAction, enCours] = useActionState(async () => declencherRelances(), null);

  return (
    <div className="rounded-lg border border-dashed p-4">
      <form action={formAction} className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : <BellRing data-icon="inline-start" aria-hidden />}
          {enCours ? t("Vérification…") : t("Vérifier les factures en retard maintenant")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("Déclenchement manuel — la vérification quotidienne automatique n'est pas encore branchée.")}
        </p>
      </form>

      {etat && "erreur" in etat ? <p className="mt-2 text-sm text-destructive">{etat.erreur}</p> : null}

      {etat && "resultats" in etat ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {etat.resultats.length === 0 ? (
            <li className="text-muted-foreground">{t("Aucune facture nouvellement en retard.")}</li>
          ) : (
            etat.resultats.map((r, i) => (
              <li
                key={`${r.factureId}-${r.canal}-${i}`}
                className={`flex items-center gap-1.5 ${r.envoye ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
              >
                {r.envoye ? (
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="size-3.5 shrink-0" aria-hidden />
                )}
                {r.envoye ? t("{numero} — relance {canal} : envoyée", { numero: r.numero, canal: r.canal }) : t("{numero} — relance {canal} : non envoyée ({erreur})", { numero: r.numero, canal: r.canal, erreur: r.erreur ?? "" })}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
