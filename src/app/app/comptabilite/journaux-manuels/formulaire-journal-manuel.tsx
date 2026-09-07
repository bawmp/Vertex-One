"use client";

import { useActionState, useState } from "react";
import { Plus, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerJournalManuel } from "@/lib/actions/journal-manuel";
import { formaterFCFA } from "@/lib/facturation/calcul";

type Ligne = { compteId: string; debit: string; credit: string };
const LIGNE_VIDE: Ligne = { compteId: "", debit: "0", credit: "0" };

export function FormulaireJournalManuel({ comptes }: { comptes: { id: string; numero: string; libelle: string }[] }) {
  const [etat, action, enCours] = useActionState(creerJournalManuel, null);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }, { ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  const totalDebit = lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const equilibre = totalDebit === totalCredit && totalDebit > 0;

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="libelle">Libellé</Label>
              <Input id="libelle" name="libelle" required placeholder="Ex. Régularisation TVA de janvier" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {lignes.map((ligne, index) => (
              <div key={index} className="grid grid-cols-[1fr_7rem_7rem_auto] items-end gap-2">
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Compte</Label> : null}
                  <Select
                    name="compteId"
                    required
                    value={ligne.compteId}
                    onChange={(e) => majLigne(index, "compteId", e.target.value)}
                  >
                    <option value="">Sélectionner…</option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} — {c.libelle}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Débit</Label> : null}
                  <Input name="debit" type="number" min="0" step="1" value={ligne.debit} onChange={(e) => majLigne(index, "debit", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Crédit</Label> : null}
                  <Input name="credit" type="number" min="0" step="1" value={ligne.credit} onChange={(e) => majLigne(index, "credit", e.target.value)} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={lignes.length === 2}
                  onClick={() => setLignes((precedent) => precedent.filter((_, i) => i !== index))}
                  aria-label="Retirer la ligne"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setLignes((p) => [...p, { ...LIGNE_VIDE }])}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter une ligne
            </Button>
          </div>

          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${equilibre ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            {equilibre ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <AlertCircle className="size-4 shrink-0" aria-hidden />}
            <span>
              Débit {formaterFCFA(totalDebit)} — Crédit {formaterFCFA(totalCredit)}
              {equilibre ? " — équilibré" : " — le journal doit être équilibré et positif"}
            </span>
          </div>

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours || !equilibre} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Enregistrement…" : "Enregistrer le journal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
