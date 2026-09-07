"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { creerBudget } from "@/lib/actions/budget";

type Ligne = { compteId: string; montant: string };
const LIGNE_VIDE: Ligne = { compteId: "", montant: "0" };

export function FormulaireBudget({ comptes }: { comptes: { id: string; numero: string; libelle: string }[] }) {
  const [etat, action, enCours] = useActionState(creerBudget, null);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  function majLigne(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" name="nom" required placeholder="Ex. Budget 2026" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="dateDebut">Début</Label>
              <Input id="dateDebut" name="dateDebut" type="date" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="dateFin">Fin</Label>
              <Input id="dateFin" name="dateFin" type="date" required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {lignes.map((ligne, index) => (
              <div key={index} className="grid grid-cols-[1fr_10rem_auto] items-end gap-2">
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Compte</Label> : null}
                  <Select name="compteId" required value={ligne.compteId} onChange={(e) => majLigne(index, "compteId", e.target.value)}>
                    <option value="">Sélectionner…</option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} — {c.libelle}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  {index === 0 ? <Label>Montant budgété (FCFA)</Label> : null}
                  <Input name="montant" type="number" min="1" step="1" value={ligne.montant} onChange={(e) => majLigne(index, "montant", e.target.value)} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={lignes.length === 1}
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

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <Button type="submit" disabled={enCours} className="self-start">
            {enCours ? <Spinner /> : null}
            {enCours ? "Création…" : "Créer le budget"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
