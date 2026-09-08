"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { televerserDocumentRH } from "@/lib/actions/document-rh";

export function FormulaireDocumentRH({ dossierRHId }: { dossierRHId: string }) {
  const [etat, action, enCours] = useActionState(televerserDocumentRH, null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="dossierRHId" value={dossierRHId} />
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="fichier">Fichier</Label>
          <Input id="fichier" name="fichier" type="file" required className="max-w-64" />
        </div>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : <Upload data-icon="inline-start" aria-hidden />}
          {enCours ? "Téléversement…" : "Ajouter"}
        </Button>
      </div>
      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}
    </form>
  );
}
