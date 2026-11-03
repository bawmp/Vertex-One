"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { noterDeclaration, type EtatDeclaration } from "@/lib/actions/declarations";
import { useT } from "@/lib/i18n/contexte";

type Statut = "A_FAIRE" | "EN_RETARD" | "DECLAREE" | "PAYEE";

/** Une ligne de suivi : où en est la déclaration du mois, avec le montant déclaré et la référence du récépissé saisis par l'entreprise. */
export function LigneDeclaration({ periode, libelleMois, echeance, collectee, deductible, aPayer, credit, affiche, statut, montant, reference, modifiable }: {
  periode: string; libelleMois: string; echeance: string; collectee: string; deductible: string; aPayer: string; credit: string;
  affiche: Statut; statut: string; montant: number | null; reference: string; modifiable: boolean;
}) {
  const t = useT();
  const [etat, setEtat] = useState<EtatDeclaration>(null);
  const [enCours, startTransition] = useTransition();
  const [s, setS] = useState(statut);
  const [m, setM] = useState(montant === null ? "" : String(montant));
  const [ref, setRef] = useState(reference);
  const badge = affiche === "PAYEE" ? <Badge variant="success">{t("Payée")}</Badge> : affiche === "DECLAREE" ? <Badge variant="info">{t("Déclarée")}</Badge> : affiche === "EN_RETARD" ? <Badge variant="danger">{t("En retard")}</Badge> : <Badge variant="neutral">{t("À faire")}</Badge>;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium capitalize">{libelleMois}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("avant le {date}", { date: echeance })}</span>
          {badge}
        </div>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {t("Collectée {a} · déductible {b} · à payer {c} · crédit {d}", { a: collectee, b: deductible, c: aPayer, d: credit })}
      </p>
      {modifiable ? (
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label={t("Statut")} value={s} onChange={(e) => setS(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            <option value="A_FAIRE">{t("À faire")}</option>
            <option value="DECLAREE">{t("Déclarée")}</option>
            <option value="PAYEE">{t("Payée")}</option>
          </select>
          <input aria-label={t("Montant déclaré")} placeholder={t("Montant déclaré")} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, ""))} className="h-9 w-36 rounded-lg border border-input bg-background px-2 text-sm" />
          <input aria-label={t("Référence du récépissé")} placeholder={t("Référence du récépissé")} maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} className="h-9 w-48 rounded-lg border border-input bg-background px-2 text-sm" />
          <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={() => { setEtat(null); startTransition(async () => setEtat(await noterDeclaration(periode, s, m === "" ? null : Number(m), ref))); }}>
            {t("Enregistrer")}
          </Button>
        </div>
      ) : null}
      {etat?.erreur ? <p role="alert" className="text-xs text-destructive">{etat.erreur}</p> : null}
      {etat?.message ? <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{etat.message}</p> : null}
    </div>
  );
}
