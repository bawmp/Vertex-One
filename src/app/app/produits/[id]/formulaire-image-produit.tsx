"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { televerserImageProduit } from "@/lib/actions/produit";

export function FormulaireImageProduit({ produitId }: { produitId: string }) {
  const [etat, action, enCours] = useActionState(televerserImageProduit.bind(null, produitId), null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="image">Image</Label>
          <Input id="image" name="image" type="file" accept="image/*" required className="max-w-64" />
        </div>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : <Upload data-icon="inline-start" aria-hidden />}
          {enCours ? "Téléversement…" : "Téléverser"}
        </Button>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
