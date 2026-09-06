"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { televerserDocumentFinancier } from "@/lib/actions/document-financier";

export function FormulaireTeleverserDocument() {
  const [etat, action, enCours] = useActionState(televerserDocumentFinancier, null);
  const [ouvert, setOuvert] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const enCoursPrecedent = useRef(false);

  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && !etat?.erreur) {
      formRef.current?.reset();
      setOuvert(false);
    }
    enCoursPrecedent.current = enCours;
  }, [enCours, etat]);

  if (!ouvert) {
    return (
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Upload data-icon="inline-start" aria-hidden />
        Téléverser
      </Button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fichier">Fichier (reçu, facture fournisseur, relevé…)</Label>
        <Input id="fichier" name="fichier" type="file" required />
      </div>

      {etat?.erreur ? <p className="text-sm text-destructive">{etat.erreur}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? <Spinner /> : null}
          {enCours ? "Envoi…" : "Envoyer"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
