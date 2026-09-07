"use client";

import { useActionState, useState } from "react";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { creerProduit } from "@/lib/actions/produit";

export function FormulaireNouveauProduit() {
  const [etat, action, enCours] = useActionState(creerProduit, null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"BIEN" | "SERVICE">("SERVICE");
  const [suiviStock, setSuiviStock] = useState(false);

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Nouveau produit
      </Button>
    );
  }

  return (
    <Card>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Package className="size-4" aria-hidden />
            Nouveau produit
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" name="nom" required minLength={2} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as "BIEN" | "SERVICE")}>
                <option value="SERVICE">Service</option>
                <option value="BIEN">Bien</option>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prixVente">Prix de vente (FCFA)</Label>
              <Input id="prixVente" name="prixVente" type="number" min={0} defaultValue={0} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="prixAchat">Prix d&apos;achat (FCFA)</Label>
              <Input id="prixAchat" name="prixAchat" type="number" min={0} defaultValue={0} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>

          {type === "BIEN" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="suiviStock" checked={suiviStock} onChange={(e) => setSuiviStock(e.target.checked)} className="size-4" />
                Suivre le stock (une vente le diminue, un achat facturé l&apos;augmente)
              </label>
              {suiviStock ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="stockInitial">Stock initial</Label>
                  <Input id="stockInitial" name="stockInitial" type="number" min={0} defaultValue={0} className="max-w-32" />
                </div>
              ) : null}
            </div>
          ) : null}

          {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? <Spinner /> : null}
              {enCours ? "Création…" : "Créer"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
