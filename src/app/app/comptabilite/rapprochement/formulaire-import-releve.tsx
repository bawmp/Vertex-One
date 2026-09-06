"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { formaterFCFA } from "@/lib/facturation/calcul";
import { importerReleveBancaire, confirmerRapprochementPaiement } from "@/lib/actions/rapprochement";

export function FormulaireImportReleve() {
  const [etat, action, enCours] = useActionState(importerReleveBancaire, null);
  const [confirmes, setConfirmes] = useState<Set<string>>(new Set());
  const [, demarrerConfirmation] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="releve">Fichier CSV</Label>
          <Input id="releve" name="releve" type="file" accept=".csv,text/csv" required />
        </div>
        <Button type="submit" disabled={enCours}>
          {enCours ? <Spinner /> : <Upload data-icon="inline-start" aria-hidden />}
          {enCours ? "Analyse…" : "Analyser"}
        </Button>
      </form>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      {etat?.suggestions ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {etat.suggestions.length} ligne(s) du relevé analysée(s)
          </h2>
          <Card className="p-0">
            <div className="flex flex-col divide-y divide-border">
              {etat.suggestions.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 px-4 py-3 text-sm">
                  <p className="font-medium">
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(s.ligne.date))} —{" "}
                    {s.ligne.libelle} — {formaterFCFA(s.ligne.montant)}
                  </p>
                  {s.paiementsProbables.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun paiement correspondant trouvé.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {s.paiementsProbables.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                          <span className="text-xs text-muted-foreground">
                            Facture {p.numeroFacture} — {formaterFCFA(p.montant)} —{" "}
                            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(p.datePaiement))}
                          </span>
                          {confirmes.has(p.id) ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="size-3.5" aria-hidden />
                              Rapproché
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                demarrerConfirmation(async () => {
                                  await confirmerRapprochementPaiement(p.id);
                                  setConfirmes((prec) => new Set(prec).add(p.id));
                                })
                              }
                            >
                              Confirmer
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
